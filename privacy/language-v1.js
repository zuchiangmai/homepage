const { search, hash } = window.location;
for (const link of document.querySelectorAll('.fs-header [data-language]')) {
  const url = new URL(link.href);
  url.search = search;
  url.hash = hash;
  link.href = url.href;
}
