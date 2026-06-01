export function scrollViewportHeight(scrollEl) {
  const rect = scrollEl.getBoundingClientRect();
  const client = scrollEl.clientHeight;
  const maxReasonable = Math.max(
    320,
    window.innerHeight - Math.max(0, rect.top) - 16,
  );
  if (client > 0 && client <= maxReasonable * 1.2) return client;
  const fromRect = rect.height;
  if (fromRect > 0 && fromRect <= maxReasonable * 1.2) return fromRect;
  return maxReasonable;
}

export function offsetTopInScrollParent(el, scrollParent) {
  let top = 0;
  let node = el;
  while (node && node !== scrollParent) {
    top += node.offsetTop;
    node = node.offsetParent;
  }
  return top;
}

/** Virtual spacers use a fixed row height; real cards can be taller — use DOM height when larger. */
export function virtualListContentHeight(container, totalRows, rowHeight) {
  const virtual = Math.ceil(totalRows) * rowHeight;
  const dom = container?.offsetHeight ?? 0;
  return Math.max(virtual, dom);
}

export function mainMaxScrollTop(scrollEl) {
  return Math.max(0, scrollEl.scrollHeight - scrollViewportHeight(scrollEl));
}
