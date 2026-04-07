import {
  Body,
  Button,
  Container,
  Head,
  Heading,
  Hr,
  Html,
  Link,
  Preview,
  Section,
  Text,
} from "@react-email/components"

interface OnboardingCompleteEmailProps {
  restaurantName?: string
  dashboardUrl: string
  productsCount?: number
  locationsCount?: number
  deliveryAreasCount?: number
}

export function OnboardingCompleteEmail({
  restaurantName,
  dashboardUrl,
  productsCount,
  locationsCount,
  deliveryAreasCount,
}: OnboardingCompleteEmailProps) {
  const previewText = restaurantName
    ? `${restaurantName} ya esta listo para recibir pedidos con Echo`
    : "Tu restaurante ya esta listo para recibir pedidos con Echo"

  return (
    <Html>
      <Head />
      <Preview>{previewText}</Preview>
      <Body style={main}>
        <Container style={container}>
          <Heading style={heading}>Bienvenido a Echo</Heading>

          <Text style={paragraph}>
            {restaurantName
              ? `Felicitaciones! ${restaurantName} ha completado la configuracion inicial y esta listo para recibir pedidos.`
              : "Felicitaciones! Tu restaurante ha completado la configuracion inicial y esta listo para recibir pedidos."}
          </Text>

          {(productsCount || locationsCount || deliveryAreasCount) && (
            <Section style={summarySection}>
              <Text style={summaryTitle}>Resumen de configuracion:</Text>
              {productsCount !== undefined && productsCount > 0 && (
                <Text style={summaryItem}>
                  - {productsCount} producto{productsCount !== 1 ? "s" : ""} en
                  el menu
                </Text>
              )}
              {locationsCount !== undefined && locationsCount > 0 && (
                <Text style={summaryItem}>
                  - {locationsCount} ubicacion{locationsCount !== 1 ? "es" : ""}{" "}
                  configurada{locationsCount !== 1 ? "s" : ""}
                </Text>
              )}
              {deliveryAreasCount !== undefined && deliveryAreasCount > 0 && (
                <Text style={summaryItem}>
                  - {deliveryAreasCount} zona
                  {deliveryAreasCount !== 1 ? "s" : ""} de entrega
                </Text>
              )}
            </Section>
          )}

          <Text style={paragraph}>
            Ahora puedes acceder al dashboard para gestionar pedidos, actualizar
            tu menu y configurar tu asistente de IA.
          </Text>

          <Section style={buttonContainer}>
            <Button style={button} href={dashboardUrl}>
              Ir al Dashboard
            </Button>
          </Section>

          <Hr style={hr} />

          <Text style={footerText}>
            Si tienes alguna pregunta o necesitas ayuda, no dudes en
            contactarnos en{" "}
            <Link href="mailto:soporte@clonai.co" style={link}>
              soporte@clonai.co
            </Link>
          </Text>

          <Text style={footerText}>
            Gracias por elegir Echo para tu restaurante.
          </Text>

          <Text style={signature}>El equipo de Echo</Text>
        </Container>
      </Body>
    </Html>
  )
}

const main = {
  backgroundColor: "#f6f9fc",
  fontFamily:
    '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Ubuntu, sans-serif',
}

const container = {
  backgroundColor: "#ffffff",
  margin: "0 auto",
  padding: "40px 20px",
  maxWidth: "560px",
  borderRadius: "8px",
}

const heading = {
  color: "#1a1a1a",
  fontSize: "28px",
  fontWeight: "700",
  textAlign: "center" as const,
  margin: "0 0 24px",
}

const paragraph = {
  color: "#525f7f",
  fontSize: "16px",
  lineHeight: "26px",
  margin: "0 0 16px",
}

const summarySection = {
  backgroundColor: "#f8fafc",
  borderRadius: "6px",
  padding: "16px 20px",
  margin: "16px 0 24px",
}

const summaryTitle = {
  color: "#1a1a1a",
  fontSize: "14px",
  fontWeight: "600",
  margin: "0 0 8px",
}

const summaryItem = {
  color: "#525f7f",
  fontSize: "14px",
  lineHeight: "22px",
  margin: "0",
}

const buttonContainer = {
  textAlign: "center" as const,
  margin: "32px 0",
}

const button = {
  backgroundColor: "#000000",
  borderRadius: "6px",
  color: "#ffffff",
  fontSize: "16px",
  fontWeight: "600",
  textDecoration: "none",
  textAlign: "center" as const,
  display: "inline-block",
  padding: "12px 24px",
}

const hr = {
  borderColor: "#e6ebf1",
  margin: "32px 0",
}

const footerText = {
  color: "#8898aa",
  fontSize: "14px",
  lineHeight: "22px",
  margin: "0 0 8px",
}

const link = {
  color: "#000000",
  textDecoration: "underline",
}

const signature = {
  color: "#1a1a1a",
  fontSize: "14px",
  fontWeight: "600",
  margin: "16px 0 0",
}

export default OnboardingCompleteEmail
