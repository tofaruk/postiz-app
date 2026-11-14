// The public base URL of the R2 bucket (CLOUDFLARE_BUCKET_URL) without trailing slashes. Media links are built as
// `${bucketUrl()}/${file}`, so a trailing slash in the setting gave `https://media.example.com//file`, which R2
// answers with 404.
export function bucketUrl(value = process.env.CLOUDFLARE_BUCKET_URL) {
  return (value ?? '').replace(/\/+$/, '');
}
