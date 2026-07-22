export function appendUniquePhotoUris(current: string[], incoming: string[]) {
  return [...current, ...incoming].filter(
    (uri, index, all) => all.indexOf(uri) === index
  );
}

export function removePhotoUri(photoUris: string[], index: number) {
  return photoUris.filter((_, itemIndex) => itemIndex !== index);
}

export function movePhotoUri(photoUris: string[], index: number, direction: -1 | 1) {
  const targetIndex = index + direction;
  if (index < 0 || index >= photoUris.length || targetIndex < 0 || targetIndex >= photoUris.length) {
    return [...photoUris];
  }

  const next = [...photoUris];
  [next[index], next[targetIndex]] = [next[targetIndex], next[index]];
  return next;
}
