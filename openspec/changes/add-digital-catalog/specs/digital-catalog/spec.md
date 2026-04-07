# Digital Catalog Specification

## Purpose
The digital catalog provides restaurants with an auto-generated public menu website from their existing product data. It enables customers to browse products and initiate orders via WhatsApp, keeping them in the restaurant's ecosystem instead of third-party platforms.

## Requirements

## ADDED Requirements

### Requirement: Public Catalog Generation
The system SHALL auto-generate a public digital catalog from menu products.

#### Scenario: Access catalog by URL
- **WHEN** a visitor accesses `/catalog/[restaurant-slug]`
- **THEN** the restaurant's catalog is displayed
- **AND** no authentication is required

#### Scenario: Catalog displays products
- **WHEN** catalog page loads
- **THEN** all active products are displayed
- **AND** products show: name, description, price, image (if available)
- **AND** products are grouped by category

#### Scenario: Category navigation
- **WHEN** visitor views the catalog
- **THEN** category tabs or sidebar is available
- **AND** clicking a category scrolls to or filters products

### Requirement: Product Display
The system SHALL display product information in an attractive, mobile-friendly format.

#### Scenario: Product with image
- **WHEN** a product has an imageUrl
- **THEN** the image is displayed prominently
- **AND** image is optimized for web loading

#### Scenario: Product without image
- **WHEN** a product has no imageUrl
- **THEN** a placeholder or category icon is shown
- **AND** product information is still displayed

#### Scenario: Product pricing
- **WHEN** product price is displayed
- **THEN** it uses Colombian peso format ($X.XXX)
- **AND** size variations show different prices (if applicable)

### Requirement: WhatsApp Order Integration
The system SHALL enable ordering via WhatsApp from the catalog.

#### Scenario: Order single product
- **WHEN** visitor clicks "Pedir por WhatsApp" on a product
- **THEN** WhatsApp opens with pre-filled message
- **AND** message includes: product name, price, greeting

#### Scenario: Pre-filled message format
- **WHEN** WhatsApp link is generated
- **THEN** message format is: "Hola, quiero pedir: [Producto] - $[Precio]"
- **AND** the restaurant's WhatsApp number is used

#### Scenario: General inquiry button
- **WHEN** visitor clicks "Contactar por WhatsApp"
- **THEN** WhatsApp opens with general greeting
- **AND** visitor can ask questions or place custom orders

### Requirement: Catalog Customization
The system SHALL allow restaurants to customize their catalog appearance.

#### Scenario: Custom URL slug
- **WHEN** admin configures catalog settings
- **THEN** they can set a custom slug (e.g., "pizzeria-mario")
- **AND** the catalog is accessible at `/catalog/pizzeria-mario`

#### Scenario: Branding customization
- **WHEN** admin customizes catalog branding
- **THEN** they can upload: logo, banner image
- **AND** they can select theme colors
- **AND** branding appears on the public catalog

#### Scenario: Toggle catalog visibility
- **WHEN** admin toggles catalog to private
- **THEN** the public URL returns a "not available" message
- **AND** catalog can be re-enabled anytime

### Requirement: Mobile Optimization
The system SHALL provide a mobile-first catalog experience.

#### Scenario: Mobile responsive layout
- **WHEN** catalog is viewed on mobile device
- **THEN** layout adapts to screen size
- **AND** products are easily browsable
- **AND** WhatsApp buttons are easily tappable

#### Scenario: Fast loading on mobile
- **WHEN** catalog loads on mobile network
- **THEN** images are optimized for mobile
- **AND** page loads within 3 seconds on 3G

### Requirement: SEO and Social Sharing
The system SHALL optimize catalogs for search engines and social sharing.

#### Scenario: Social media preview
- **WHEN** catalog URL is shared on social media
- **THEN** Open Graph meta tags provide: title, description, image
- **AND** preview shows restaurant name and sample products

#### Scenario: Search engine indexing
- **WHEN** search engines crawl the catalog
- **THEN** structured data (Restaurant schema) is present
- **AND** products are indexable

### Requirement: Catalog Settings in Dashboard
The system SHALL provide a settings interface for catalog management.

#### Scenario: Access catalog settings
- **WHEN** admin navigates to catalog settings
- **THEN** they see: current URL, customization options, visibility toggle

#### Scenario: Preview catalog
- **WHEN** admin clicks "Ver catálogo"
- **THEN** the public catalog opens in a new tab
- **AND** admin can see how customers will view it
