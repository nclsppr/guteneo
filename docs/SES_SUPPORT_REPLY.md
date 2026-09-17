# Proposed reply — AWS SES case 178960365600775

Status: authorized by the publisher and sent in the existing AWS case on 2026-09-17 at 02:17:25 Europe/Paris. The support correspondence displayed the complete submitted reply. The body below retains Markdown emphasis for readability; the submitted message used plain text.

Hello AWS Trust & Safety team,

Thank you for reviewing this request. Guteneo (https://guteneo.com) is a document-delivery application operated by Nicolas Pieper. We are preparing a small beta, not an existing high-volume mailing operation. We request production access in Europe (Paris), eu-west-3, so that transactional messages can reach recipients who are not SES-verified identities. We do not need a higher initial volume than 200 recipients per day and one recipient per second.

**Use case and frequency.** Messages are individual document deliveries explicitly initiated by a signed-in user, through the Guteneo dashboard or a connected assistant. A person reviews the exact document, recipient and cost before an immutable sending request can be accepted. We also intend to use transactional account-verification and password-reset messages. There are no scheduled newsletters or promotional campaigns. Initial qualification will use our own addresses, followed by a limited beta with trusted users. Actual volume has not yet been established; sending is currently disabled in the application.

**Recipients and consent.** We do not buy, rent or scrape mailing lists. The beta is intended for deliveries requested or expected by the recipient, not cold outreach. Before opening sending to beta users, we will require verified accounts and an explicit confirmation that the intended recipient has requested the communication. Recipients are associated with individual sending requests, rather than a marketing subscription list. Marketing preparation is currently rejected by the backend.

**Sender authentication and permissions.** Our sending domain is guteneo.com; the dedicated application sender is notifications@guteneo.com. Immediately before this reply, we verified in the SES console in eu-west-3 that the domain status is Verified, DKIM is Successful (RSA 2048 signing enabled), and custom MAIL FROM bounce.guteneo.com is Successful. Public DNS independently returns all three SES DKIM CNAMEs, the Paris SES MAIL FROM MX, SPF and DMARC (currently p=none). A dedicated IAM sender is restricted to this domain and our Guteneo configuration set. Our application does not allow arbitrary unauthenticated use of that AWS identity.

**Bounces, complaints and stop requests.** The Guteneo configuration set publishes delivery, bounce, complaint, rejection and rendering-failure events to SNS. Its HTTPS subscription is confirmed; the application verifies the topic and SNS signature before processing notifications. Permanent bounces and complaints add the address to a suppression list checked during preparation, confirmation and sending. The SES configuration set also enables bounce/complaint suppression. Recipients can contact guteneo@pieper.fr to request that sending stop; such requests will be handled by the operator. We are not enabling marketing while its automated unsubscribe flow is incomplete.

**Example transactional message.**

From: Guteneo <notifications@guteneo.com>

Subject: Your requested document — Guteneo

Hello,

A Guteneo user has sent you the document you requested. The PDF is attached. If this delivery was unexpected or you want us to stop sending to this address, please contact guteneo@pieper.fr.

Guteneo — https://guteneo.com

We understand the requirement to send only requested email and to act on bounces and complaints. Production sending will remain closed until authentication, recipient controls, rate limits and an end-to-end delivery test have been verified. Please let us know if you need any further information to assess the request.

Kind regards,
Nicolas Pieper
Guteneo — guteneo@pieper.fr
