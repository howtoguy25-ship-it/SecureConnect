import { Resend } from 'resend';
import { StoreOrder } from './types';

// Real transactional email for a new store order -- the in-app banner (lastOrderNotice)
// only reaches a seller with the app open; this reaches them even when it's closed, without
// needing to build real push-notification infrastructure (no APNs/device-token system
// exists anywhere in this app -- see ROADMAP.md Phase 9's same note for the billing banner).
//
// Sends from orders@buildsitespark.com, which needs that domain verified as a sending
// domain in the Resend dashboard (Domains -> Add Domain -> add the DNS records it shows at
// GoDaddy, same pattern as buildsitespark.com's own Hosting setup) before this will
// actually deliver -- until then, Resend will reject the send rather than silently drop it,
// so a failure here is visible in the Cloud Functions logs, not a mystery.
export async function sendOrderNotificationEmail(apiKey: string, sellerEmail: string, order: StoreOrder): Promise<void> {
  const resend = new Resend(apiKey);
  const itemsList = order.items.map((item) => `${item.quantity} × ${item.name} — $${(item.priceUsd * item.quantity).toFixed(2)}`).join('<br>');

  await resend.emails.send({
    from: 'SiteSpark Orders <orders@buildsitespark.com>',
    to: sellerEmail,
    subject: `New order — $${order.sellerNetUsd.toFixed(2)} after fees`,
    html: `
      <div style="font-family:-apple-system,sans-serif;max-width:480px;margin:0 auto;">
        <h2>You've got a new order</h2>
        <p>${itemsList}</p>
        <p>
          Subtotal: $${order.subtotalUsd.toFixed(2)}<br>
          Platform fee: -$${order.platformFeeUsd.toFixed(2)}<br>
          <strong>Your payout: $${order.sellerNetUsd.toFixed(2)}</strong>
        </p>
        <p style="color:#64748B;font-size:13px;">
          Buyer: ${order.buyerName ?? 'Unknown'} (${order.buyerEmail ?? 'no email provided'})<br>
          View this order and your full payout history in the SiteSpark app.
        </p>
      </div>
    `,
  });
}
