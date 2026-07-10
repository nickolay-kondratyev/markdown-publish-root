/**
 * Breadcrumb styles: stock @quartz-community/breadcrumbs `breadcrumbs.scss`
 * flattened to plain CSS (our plugins ship unbuilt ESM), plus the style for
 * plain-text folder segments (stock had none — its folders were links).
 * Re-verify against the stock file on deliberate Quartz pin bumps.
 */
export const BREADCRUMBS_CSS = `
.breadcrumb-container {
  margin: 0;
  margin-top: 0.75rem;
  padding: 0;
  display: flex;
  flex-direction: row;
  flex-wrap: wrap;
  gap: 0.5rem;
}

.breadcrumb-element {
  display: flex;
  flex-direction: row;
  align-items: center;
  justify-content: center;
}
.breadcrumb-element p {
  margin: 0;
  margin-left: 0.5rem;
  padding: 0;
  line-height: normal;
}
/* Folder segments and the current page are PLAIN TEXT (collapse-only folders
   have no URLs); keep them visually quiet next to the linked Home crumb. */
.breadcrumb-element span {
  color: var(--gray);
}
`
