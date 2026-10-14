import { describe, expect, it } from 'vitest';

import { htmlToText } from './html-to-text.js';

describe('htmlToText', () => {
  it('keeps the text and line breaks, drops tags, scripts and styles', () => {
    const html =
      '<html><head><style>p{color:red}</style></head><body><p>Total a pagar:&nbsp;<b>$&nbsp;1.234,56</b></p>' +
      '<script>alert(1)</script><table><tr><td>Vence</td><td>10/11</td></tr></table>' +
      '<p>Peque&ntilde;o &amp; &#233;xito</p></body></html>';
    expect(htmlToText(html)).toBe('Total a pagar: $ 1.234,56\nVence 10/11\n\nPequeño & éxito');
  });

  it('survives hostile input in linear time and never throws', () => {
    const started = Date.now();
    expect(htmlToText('<a '.repeat(200_000)).length).toBeGreaterThan(0);
    expect(htmlToText(`${'<script>'.repeat(50_000)}x`)).toBe('');
    expect(Date.now() - started).toBeLessThan(2000);
    expect(htmlToText('a&#99999999;b&#x110000;c&#0;d')).toBe('a b c d');
  });
});
