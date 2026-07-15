export function teardownMediaElement(media: HTMLMediaElement | null): void {
  if (media === null) return;

  media.pause();
  media.removeAttribute("src");
  media.load();
}
