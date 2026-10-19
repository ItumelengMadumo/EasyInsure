# Notifications and debit orders: what each needs first

These are not built. Email, SMS and WhatsApp are wired to disabled adapters (`communication-worker`), and accepting a quote does not set up a debit order. This note lists what has to be decided or supplied before either can go live, so the work can start without surprises.

## WhatsApp (the channel most clients will actually reply on)

1. **Provider and number.** Choose a WhatsApp Business provider (Meta Cloud API directly, or a South African BSP) and register a business number. The provider's approval of the business account can take days.
2. **Message templates.** Outbound messages outside a 24-hour customer window must use pre-approved templates. Draft and submit templates for: information requested, claim received, claim approved, claim not approved, payment made, quote ready. Approval is by the provider and can be rejected.
3. **Consent (POPIA).** Record explicit opt-in per client and channel, with the date and wording, and honour opt-out. The sign-up and profile screens need an opt-in control that stores this.
4. **Inbound.** The signed webhook `POST /v1/inbound` already normalises and de-duplicates inbound messages by claim number. The provider's signature scheme must be mapped to the HMAC secret in `COMMUNICATION_WEBHOOK_SECRET`.
5. **Adapter.** Replace the disabled adapter in `amplify/functions/communication-worker` with the provider call, keeping delivery-state callbacks flowing into `CommunicationDelivery`.
6. **Compliance sign-off** on retention for message content and any call recordings.

## Email and SMS

Choose providers (for example SES for email and an SMS aggregator), verify the sending domain (SPF, DKIM, DMARC), and supply the same templates and consent controls as above.

## Debit orders

Accepting a quote currently activates cover and states plainly that no payment is taken. Collecting premiums needs, before any code:

- A payment partner able to run debit orders in South Africa (for example via a bank or a collections provider), with NAEDO/DebiCheck mandate support.
- Product decisions: collection day, failed-payment handling, grace period and what happens to cover.
- Compliance review of mandate wording and the cooling-off period interaction.
- A decision on whether cover activates on acceptance, on first successful collection, or on mandate approval.
