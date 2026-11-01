export * from "./postal-destinations";
export * from "./postal-recipient";
export type { DeliveryRecipient } from "./content";
export {
  POSTAL_ADDRESS_PAGE_VERSION,
  POSTAL_ADDRESS_BLOCK_PAGE_VERSION,
  postalAddressPageVersion,
  postalAddressLines,
  type PostalAddressPageVersion,
} from "./postal-address-page";
export {
  PINGEN_PREFLIGHT_VERSION,
  PINGEN_ADDRESS_BLOCK_PREFLIGHT_VERSION,
  pingenPreflightVersion,
  type PingenPreflightOptions,
  type PingenPreflightVersion,
} from "./pingen-preflight";
