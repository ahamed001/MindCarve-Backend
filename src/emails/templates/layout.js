const escapeHtml = (value = '') =>
  String(value).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

export const renderLayout = ({ heading, paragraphs, ctaLabel, ctaUrl, footnote }) => `<!doctype html>
<html><body style="margin:0;background:#faf7f2;font-family:Arial,Helvetica,sans-serif;color:#1c2333">
  <table width="100%" cellpadding="0" cellspacing="0" style="padding:32px 12px"><tr><td align="center">
    <table width="560" cellpadding="0" cellspacing="0" style="background:#ffffff;border:1px solid #ece4d8;border-radius:14px;padding:32px">
      <tr><td style="font-size:15px;font-weight:bold;color:#e8742a">Athma Mind Care Hospital</td></tr>
      <tr><td style="padding-top:16px;font-size:20px;font-weight:bold">${escapeHtml(heading)}</td></tr>
      ${paragraphs.map((p) => `<tr><td style="padding-top:12px;font-size:14px;line-height:1.6;color:#4a5263">${escapeHtml(p)}</td></tr>`).join('')}
      <tr><td style="padding-top:24px"><a href="${escapeHtml(ctaUrl)}" style="display:inline-block;background:#e8742a;color:#ffffff;text-decoration:none;padding:12px 22px;border-radius:10px;font-weight:bold;font-size:14px">${escapeHtml(ctaLabel)}</a></td></tr>
      <tr><td style="padding-top:20px;font-size:12px;color:#8a8f99;line-height:1.5">If the button doesn't work, copy this link into your browser:<br>${escapeHtml(ctaUrl)}</td></tr>
      ${footnote ? `<tr><td style="padding-top:16px;font-size:12px;color:#8a8f99">${escapeHtml(footnote)}</td></tr>` : ''}
    </table>
  </td></tr></table>
</body></html>`;
