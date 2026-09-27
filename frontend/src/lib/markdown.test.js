// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { renderMarkdown } from './markdown';

describe('renderMarkdown', () => {
  it('keeps code blocks as text and marks mermaid blocks', () => {
    const html = renderMarkdown('```js\n<b>x</b>\n```\n\n```mermaid\ngraph TD; A-->B\n```');
    expect(html).toContain('&lt;b&gt;x&lt;/b&gt;');
    expect(html).toContain('class="mermaid"');
  });
});
