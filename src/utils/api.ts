// Helper fetch untuk dashboard staf.
// Jika API mengembalikan 401 (sesi token kedaluwarsa/hilang padahal
// sessionStorage masih ada), otomatis panggil onUnauthorized (logout)
// agar tidak terjadi banjir polling 401 yang tidak ada habisnya.
export async function apiFetch(
  url: string,
  options?: RequestInit,
  onUnauthorized?: () => void
): Promise<Response> {
  const res = await fetch(url, options);
  if (res.status === 401 && onUnauthorized) {
    try {
      onUnauthorized();
    } catch {}
  }
  return res;
}
