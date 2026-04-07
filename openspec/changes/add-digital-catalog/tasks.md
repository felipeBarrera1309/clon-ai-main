## 1. Schema & Backend
- [ ] 1.1 Create `catalogSettings` table (slug, isPublic, theme, logoUrl, bannerUrl, organizationId)
- [ ] 1.2 Create public query `getCatalogBySlug` (no auth required)
- [ ] 1.3 Create public query `getCatalogProducts` (no auth required)
- [ ] 1.4 Create mutation `updateCatalogSettings`
- [ ] 1.5 Generate unique slug for each organization

## 2. Public Catalog Page
- [ ] 2.1 Create `(public)/catalog/[slug]` route
- [ ] 2.2 Create catalog layout with restaurant branding
- [ ] 2.3 Create product grid/list view
- [ ] 2.4 Display product images (from imageUrl)
- [ ] 2.5 Display product details: name, description, price
- [ ] 2.6 Group products by category
- [ ] 2.7 Add category navigation/filtering

## 3. WhatsApp Integration
- [ ] 3.1 Create "Pedir por WhatsApp" button per product
- [ ] 3.2 Generate WhatsApp deep link with pre-filled message
- [ ] 3.3 Message format: "Hola, quiero pedir: [producto] - $[precio]"
- [ ] 3.4 Create "Ver menú completo en WhatsApp" button
- [ ] 3.5 Track click analytics (optional)

## 4. Catalog Customization
- [ ] 4.1 Create catalog settings page in dashboard
- [ ] 4.2 Allow custom slug configuration
- [ ] 4.3 Allow logo upload
- [ ] 4.4 Allow banner image upload
- [ ] 4.5 Allow theme color selection
- [ ] 4.6 Toggle catalog public/private

## 5. SEO & Sharing
- [ ] 5.1 Add meta tags for social sharing (Open Graph)
- [ ] 5.2 Add restaurant name and description to meta
- [ ] 5.3 Generate social preview image
- [ ] 5.4 Add structured data for Google (Restaurant schema)

## 6. Mobile Optimization
- [ ] 6.1 Ensure responsive design for mobile
- [ ] 6.2 Optimize images for mobile loading
- [ ] 6.3 Add PWA capabilities (optional)
- [ ] 6.4 Test on various mobile devices

## 7. Future: Marketplace (Phase 2)
- [ ] 7.1 Create marketplace landing page
- [ ] 7.2 List all public catalogs
- [ ] 7.3 Add search and filtering
- [ ] 7.4 Add location-based discovery
- [ ] 7.5 Add featured restaurants section

## 8. Testing & Validation
- [ ] 8.1 Test catalog loads without authentication
- [ ] 8.2 Test WhatsApp deep links work correctly
- [ ] 8.3 Test mobile responsiveness
- [ ] 8.4 Verify linting passes on all modified files
