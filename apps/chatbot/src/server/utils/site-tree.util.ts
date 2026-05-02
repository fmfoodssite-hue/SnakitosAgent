import siteContentTree from "../data/site-content-tree.json";

type SiteMetadataSeed = {
  name?: string;
  description?: string;
  tags?: string[];
  link?: string;
  fallback_link?: string;
  discoverability_status?: string;
};

type SiteTreeNode = {
  id?: string;
  title?: string;
  url?: string;
  type?: string;
  metadata_seed?: SiteMetadataSeed;
  children?: SiteTreeNode[];
};

export type CanonicalTreeProduct = {
  id: string;
  title: string;
  link: string;
  fallbackLink: string;
  description: string | null;
  productType: string | null;
  tags: string[];
};

type SiteTreeRoot = {
  root?: SiteTreeNode;
};

function getRootNode(): SiteTreeNode {
  return (siteContentTree as SiteTreeRoot).root ?? { children: [] };
}

function normalizeTag(value: string): string {
  return value.trim().toLowerCase();
}

function toProductType(collectionTitle?: string): string | null {
  if (!collectionTitle) {
    return null;
  }

  if (/patata chips/i.test(collectionTitle)) {
    return "Potato Slims";
  }

  return collectionTitle;
}

export function getSiteCollections(): Array<{
  id: string;
  title: string;
  link: string;
  description: string;
}> {
  const productCategory = getRootNode().children?.find((node) => node.id === "cat:product");
  if (!productCategory?.children) {
    return [];
  }

  return productCategory.children
    .filter((node) => node.type === "collection_page")
    .map((node) => ({
      id: node.id ?? node.title ?? "collection",
      title: node.metadata_seed?.name ?? node.title ?? "Collection",
      link: node.metadata_seed?.link ?? node.url ?? "https://snakitos.com/collections/all",
      description: node.metadata_seed?.description ?? "Snakitos collection page.",
    }));
}

export function getCanonicalTreeProducts(): CanonicalTreeProduct[] {
  const products: CanonicalTreeProduct[] = [];

  function visit(node: SiteTreeNode, parentCollectionTitle?: string) {
    const currentCollectionTitle =
      node.type === "collection_page" ? node.metadata_seed?.name ?? node.title : parentCollectionTitle;

    if (node.type === "product_page") {
      const tags = [
        ...(node.metadata_seed?.tags ?? []),
        currentCollectionTitle ? normalizeTag(currentCollectionTitle) : "",
      ].filter(Boolean);

      products.push({
        id: node.id ?? node.title ?? `product-${products.length + 1}`,
        title: node.metadata_seed?.name ?? node.title ?? "Snakitos Product",
        link: node.metadata_seed?.link ?? node.url ?? "https://snakitos.com/collections/all",
        fallbackLink:
          node.metadata_seed?.fallback_link ??
          (currentCollectionTitle
            ? `https://snakitos.com/collections/${normalizeTag(currentCollectionTitle).replace(/\s+/g, "-")}`
            : "https://snakitos.com/collections/all"),
        description: node.metadata_seed?.description ?? null,
        productType: toProductType(currentCollectionTitle),
        tags: Array.from(new Set(tags.map(normalizeTag))),
      });
    }

    for (const child of node.children ?? []) {
      visit(child, currentCollectionTitle);
    }
  }

  visit(getRootNode());
  return products;
}
