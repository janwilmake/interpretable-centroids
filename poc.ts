// LLM-based Category Assignment - POC
// This script implements the concept of using an LLM to create logical categories for items
// and then assign items to those categories

const OPENAI_API_KEY = "YOUR KEY"; // Replace with your actual API key

// Configuration parameters
type Config = {
  itemCount: number; // Total number of items to categorize
  categoryCount: number; // Target number of categories
  sampleSize: number; // Number of random items to sample for category creation
  stepCategoryAmount: number; // Number of categories to create in each step
  batchSize: number; // Number of items to categorize in each batch
  maxRetries: number; // Maximum retries for API calls
};

// Default configuration
const defaultConfig: Config = {
  itemCount: 1000000,
  categoryCount: 1000,
  sampleSize: 100,
  stepCategoryAmount: 20,
  batchSize: 50,
  maxRetries: 3,
};

// System prompt for category creation
const CATEGORY_CREATION_PROMPT = `
You are an expert in organizing and categorizing information. Your task is to create logical, 
well-defined, and evenly distributed categories for a set of items.

GOALS:
1. Create {stepCategoryAmount} distinct categories that will allow for even distribution of items
2. Make categories intuitive for humans to understand
3. Ensure categories are specific enough to be useful but general enough to contain multiple items
4. Design categories that would make searching for specific items efficient

INSTRUCTIONS:
- Analyze the sample items provided
- Generate exactly {stepCategoryAmount} categories
- Provide a clear name and brief description for each category
- Format your response as a JSON with {categories:{name:string,descriptioni:string}[]}
- Do not include any explanations outside the JSON structure

The categories should be designed with the knowledge that we'll eventually need to categorize 
{itemCount} items into {categoryCount} total categories.
`;

// System prompt for item assignment
const ITEM_ASSIGNMENT_PROMPT = `
You are an expert in categorization. Your task is to assign each item to the most appropriate category
from a predefined list.

CATEGORIES:
{categories}

INSTRUCTIONS:
- For each item, select the ONE most appropriate category from the list above
- Format your response as a JSON in format {assignments:{item:string,categoryName:string}[]}
- Make decisions based on the most salient features of each item
- Be consistent in your categorization approach
- Do not include any explanations outside the JSON structure
- If an item truly doesn't fit any category, assign it to the closest match

Your goal is to ensure items are distributed as evenly as possible across categories while 
maintaining logical categorization.
`;

// Interface for Category
interface Category {
  name: string;
  description: string;
  items: string[];
}

// Interface for Item with assigned category
interface CategorizedItem {
  item: string;
  categoryName: string;
}

/**
 * Call OpenAI API
 */
async function callOpenAI(
  systemPrompt: string,
  userPrompt: string,
  retries = 0,
): Promise<any> {
  try {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: "gpt-4o",
        messages: [
          {
            role: "system",
            content: systemPrompt,
          },
          {
            role: "user",
            content: userPrompt,
          },
        ],
        temperature: 0.3,
        response_format: { type: "json_object" },
      }),
    });

    if (!response.ok) {
      const errorData = await response.json();
      console.error("API Error:", errorData);
      throw new Error(`API request failed: ${response.status}`);
    }

    const data: any = await response.json();

    const content = data.choices[0]?.message.content;

    console.log({ content });
    return JSON.parse(content);
  } catch (error) {
    if (retries < defaultConfig.maxRetries) {
      console.log(
        `Retrying API call (${retries + 1}/${defaultConfig.maxRetries})...`,
      );
      await new Promise((resolve) => setTimeout(resolve, 1000)); // Wait 1 second before retrying
      return callOpenAI(systemPrompt, userPrompt, retries + 1);
    }
    throw error;
  }
}

/**
 * Create categories based on sample items
 */
async function createCategories(
  items: string[],
  config: Config,
): Promise<Category[]> {
  // Sample a subset of items if needed
  const sampleItems =
    items.length <= config.sampleSize
      ? items
      : items.sort(() => 0.5 - Math.random()).slice(0, config.sampleSize);

  console.log(
    `Creating ${config.stepCategoryAmount} categories based on ${sampleItems.length} sample items...`,
  );

  const systemPrompt = CATEGORY_CREATION_PROMPT.replace(
    "{stepCategoryAmount}",
    config.stepCategoryAmount.toString(),
  )
    .replace("{itemCount}", config.itemCount.toString())
    .replace("{categoryCount}", config.categoryCount.toString());

  const response = await callOpenAI(
    systemPrompt,
    `Here are the sample items:\n${JSON.stringify(sampleItems)}`,
  );

  // Initialize categories with empty items arrays
  return response.categories.map(
    (cat: { name: string; description: string }) => ({
      ...cat,
      items: [],
    }),
  );
}

/**
 * Assign items to categories in batches
 */
async function assignItemsToCategories(
  items: string[],
  categories: Category[],
  config: Config,
): Promise<Category[]> {
  const categoriesInfo = categories.map((cat) => ({
    name: cat.name,
    description: cat.description,
  }));

  const systemPrompt = ITEM_ASSIGNMENT_PROMPT.replace(
    "{categories}",
    JSON.stringify(categoriesInfo, null, 2),
  );

  // Process items in batches
  for (let i = 0; i < items.length; i += config.batchSize) {
    const batchItems = items.slice(i, i + config.batchSize);
    console.log(
      `Assigning batch ${Math.floor(i / config.batchSize) + 1}/${Math.ceil(
        items.length / config.batchSize,
      )}...`,
    );

    const response = await callOpenAI(
      systemPrompt,
      `Assign these items to the most appropriate categories:\n${JSON.stringify(
        batchItems,
      )}`,
    );

    console.log({ response });

    // Add items to their assigned categories
    (response.assignments as CategorizedItem[]).forEach((assignment) => {
      const category = categories.find(
        (cat) => cat.name === assignment.categoryName,
      );
      if (category) {
        category.items.push(assignment.item);
      } else {
        console.warn(`Category not found: ${assignment.categoryName}`);
      }
    });
  }

  return categories;
}

/**
 * Recursively assign items to categories, splitting categories if needed
 */
async function assignToCategory(
  items: string[],
  config: Config = defaultConfig,
  currentDepth: number = 0,
): Promise<Category[]> {
  console.log(`[Depth ${currentDepth}] Processing ${items.length} items...`);

  // Create initial categories
  const categories = await createCategories(items, config);

  // Assign items to categories
  const populatedCategories = await assignItemsToCategories(
    items,
    categories,
    config,
  );

  // Calculate the target number of items per category
  const itemsPerCategoryCount = Math.ceil(
    config.itemCount / config.categoryCount,
  );

  // Process oversized categories recursively
  const finalCategories: Category[] = [];

  for (const category of populatedCategories) {
    if (category.items.length > itemsPerCategoryCount) {
      console.log(
        `Category "${category.name}" has ${category.items.length} items, which exceeds the target of ${itemsPerCategoryCount}. Subdividing...`,
      );

      // Recursively subdivide this category
      const subCategories = await assignToCategory(
        category.items,
        {
          ...config,
          itemCount: category.items.length,
          categoryCount: Math.ceil(
            category.items.length / itemsPerCategoryCount,
          ),
        },
        currentDepth + 1,
      );

      // Add the subcategories with a prefix to show hierarchy
      finalCategories.push(
        ...subCategories.map((subCat) => ({
          name: `${category.name} > ${subCat.name}`,
          description: `${category.description} - ${subCat.description}`,
          items: subCat.items,
        })),
      );
    } else {
      // This category is fine as is
      finalCategories.push(category);
    }
  }

  return finalCategories;
}

/**
 * Main function to demonstrate the POC
 */
async function runCategorization(
  items: string[],
  config: Partial<Config> = {},
): Promise<Category[]> {
  const finalConfig = { ...defaultConfig, ...config };
  console.log("Starting categorization with config:", finalConfig);

  const result = await assignToCategory(items, finalConfig);

  console.log("Categorization complete!");
  console.log(`Created ${result.length} categories for ${items.length} items`);

  // Print stats about the distribution
  const itemCounts = result.map((cat) => cat.items.length);
  const min = Math.min(...itemCounts);
  const max = Math.max(...itemCounts);
  const avg =
    itemCounts.reduce((sum, count) => sum + count, 0) / itemCounts.length;

  console.log(`Category statistics:
  - Min items: ${min}
  - Max items: ${max}
  - Avg items: ${avg.toFixed(2)}
  `);

  return result;
}

// Example usage with a small test dataset
const exampleItems = [
  "iPhone 13 Pro",
  "Samsung Galaxy S22",
  "MacBook Air M2",
  "Dell XPS 15",
  "AirPods Pro",
  "Sony WH-1000XM5",
  "iPad Pro 12.9",
  "Microsoft Surface Pro 9",
  "Nintendo Switch OLED",
  "PlayStation 5",
  "Amazon Echo Dot",
  "Google Nest Hub",
  "LG C2 OLED TV",
  "Samsung QN90B QLED TV",
  "Canon EOS R5",
  "Sony A7 IV",
  "DJI Mavic 3",
  "GoPro Hero 11",
  "Fitbit Sense 2",
  "Apple Watch Series 8",
  "Instant Pot Duo",
  "Ninja Air Fryer",
  "Dyson V15 Absolute",
  "iRobot Roomba j7+",
  "Kindle Paperwhite",
  "Sonos Beam",
  "Logitech MX Master 3",
  "Razer BlackWidow V3",
  "NVIDIA RTX 4080",
  "AMD Ryzen 9 5950X",
];

// Run the demo with a small dataset and configuration
// @ts-ignore
if (import.meta.main) {
  runCategorization(exampleItems, {
    itemCount: exampleItems.length,
    categoryCount: 5,
    sampleSize: 30,
    stepCategoryAmount: 5,
    batchSize: 10,
  })
    .then((categories) => {
      console.log(JSON.stringify(categories, null, 2));
    })
    .catch((error) => {
      console.error("Error:", error);
    });
}

// Export the functions for use in other modules
export {
  runCategorization,
  assignToCategory,
  createCategories,
  assignItemsToCategories,
  Category,
  Config,
};
