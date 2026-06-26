import snarkdown from 'snarkdown';
import DOMPurify from 'dompurify';

// snarkdown emits raw HTML and does NOT sanitize, and we inject the result via
// dangerouslySetInnerHTML into customers' live sites — so DOMPurify is required.
const ALLOWED_TAGS = [
  'a', 'strong', 'b', 'em', 'i', 'code', 'pre',
  'ul', 'ol', 'li', 'p', 'br', 'blockquote',
  'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
];
const ALLOWED_ATTR = ['href', 'target', 'rel'];

// Force links to open in a new tab safely. (DOMPurify already blocks javascript: URIs.)
DOMPurify.addHook('afterSanitizeAttributes', (node) => {
  if (node.tagName === 'A') {
    node.setAttribute('target', '_blank');
    node.setAttribute('rel', 'noopener noreferrer');
  }
});

/** Render markdown to a sanitized HTML string for use with dangerouslySetInnerHTML. */
export function renderMarkdown(text: string): string {
  return DOMPurify.sanitize(snarkdown(text), { ALLOWED_TAGS, ALLOWED_ATTR });
}
