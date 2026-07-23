export type Collection = {
  id: string;
  name: string;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
};

export type CollectionInput = {
  name: string;
};

export type ValidationResult = {
  issues: string[];
};

export function validateCollection(input: CollectionInput): ValidationResult {
  const issues: string[] = [];

  if (!input.name.trim()) {
    issues.push("请输入合集名称");
  }

  return { issues };
}

type CreateCollectionArgs = {
  id: string;
  now: string;
  name: string;
  sortOrder?: number;
};

export function createCollection({
  id,
  now,
  name,
  sortOrder = 0,
}: CreateCollectionArgs): Collection {
  return {
    id,
    name: name.trim(),
    sortOrder,
    createdAt: now,
    updatedAt: now,
  };
}
