// Reuse an id only while the business data and actual File objects are unchanged.
export function formSubmission(ref, payload, files = []) {
  const { createdAt, rendered_at, submit_at, submissionId, ...data } = payload;
  const fingerprint = JSON.stringify(data);
  const previous = ref.current;
  if (
    !previous ||
    previous.fingerprint !== fingerprint ||
    files.length !== previous.files.length ||
    files.some((file, i) => file !== previous.files[i])
  ) {
    ref.current = { id: crypto.randomUUID(), fingerprint, files: [...files] };
  }
  return ref.current.id;
}
