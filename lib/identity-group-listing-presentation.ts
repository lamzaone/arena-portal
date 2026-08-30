import type { IdentityGroupListing } from "@/lib/data/identity-group-listings";

export function formatIdentityGroupListingPrice(cents: number) {
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: cents % 100 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(cents / 100);
}

export function formatIdentityGroupListingDuration(minutes: number) {
  if (minutes === 0) return "Permanent";
  if (minutes % 43_200 === 0) {
    const months = minutes / 43_200;
    return `${months} month${months === 1 ? "" : "s"}`;
  }
  if (minutes % 1_440 === 0) {
    const days = minutes / 1_440;
    return `${days} day${days === 1 ? "" : "s"}`;
  }
  if (minutes % 60 === 0) {
    const hours = minutes / 60;
    return `${hours} hour${hours === 1 ? "" : "s"}`;
  }
  return `${minutes.toLocaleString()} minutes`;
}

export function isPublishedDonationListing(listing: IdentityGroupListing | null) {
  return Boolean(
    listing &&
    listing.enabled &&
    listing.vipPageEnabled &&
    listing.group.enabled,
  );
}

export function identityGroupListingRequestCopy(listing: IdentityGroupListing) {
  return {
    subject: `Donation request · ${listing.listingName.slice(0, 92)}`,
    body: `I would like to purchase listing #${listing.id}: ${listing.listingName}.\n\nConnected group: ${listing.group.displayName}\nDuration: ${formatIdentityGroupListingDuration(listing.durationMinutes)}\nCurrent donation price: ${formatIdentityGroupListingPrice(listing.euroPriceCents)}\nCatalogue item: #${listing.catalogueId}\n\nPlease contact me with payment instructions.`,
  };
}
