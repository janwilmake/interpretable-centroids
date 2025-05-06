# Why embeddings are overrated

**Thesis: LLM-based categorization > Vectorization**. It's like vector search but with human-interpretable categories.

https://claude.ai/share/5c23d6b4-11e9-4dfb-9954-652a31785a5d

What if we use LLM to divide a list of 1 million items across 1000 well-determined categories? Isn't this practically the same as vectorization, but with much better interpretability?

Long story short:

- embedding search leverages automatically mathematically calculated centroids a.k.a. categories to find the items more quickly by pruning the search space.
- instead of mathematically calculating an embedding and centroid, we can use a powerful LLM to come up with categories that evenly distributes the items across these.
- we could then do indexations on the assigned category for every SQLite row, which results in much faster search and very simple SQLDO architecture.

The question remains:

- how to categorize in a way that makes it super easy to search
- can these categories be made dynamic?

# Simplest possible implementation: POC

We want to divide `itemCount` items into `categoryCount` equally sized categories. This means we need `itemCount/categoryCount=itemsPerCategoryCount` How? For vector search people do this using mathematical vector clusters, a.k.a. centroids. We want to do this using LLMs.

Function `asignToCategory`:

1. Take `sampleSize` random items and have the LLM come up with `stepCategoryAmount` categories (single prompt)
2. Insert all items in these categories in batches of `batchSize` items each batch (using LLM)

For every category with more than `itemsPerCategoryCount` items, apply `assignToCategory`.

# Next Steps

1. finish DORM 2.0 and connect expose GET /api/db/query/raw/QUERY for the hackernews dataset
2. Put this in a cloudflare queue + worker that uses that dataset to categorize the top 100k stories of all time with DeepSeek
