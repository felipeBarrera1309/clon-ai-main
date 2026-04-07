"use client"

import { api } from "@workspace/backend/_generated/api"
import { Button } from "@workspace/ui/components/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@workspace/ui/components/card"
import { Label } from "@workspace/ui/components/label"
import { Textarea } from "@workspace/ui/components/textarea"
import { useAction, useMutation } from "convex/react"
import {
  ArrowLeftIcon,
  BookOpenIcon,
  Loader2Icon,
  MicIcon,
  PenLineIcon,
  StopCircleIcon,
} from "lucide-react"
import { useCallback, useRef, useState } from "react"
import { toast } from "sonner"

interface BusinessRulesStepProps {
  organizationId: string
  onComplete: () => void
  onSkip: () => void
  onBack: () => void
}

type InputMode = "text" | "audio"

export function BusinessRulesStep({
  organizationId,
  onComplete,
  onSkip,
  onBack,
}: BusinessRulesStepProps) {
  const [inputMode, setInputMode] = useState<InputMode>("text")
  const [rulesText, setRulesText] = useState("")
  const [isRecording, setIsRecording] = useState(false)
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null)
  const [transcription, setTranscription] = useState("")
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isTranscribing, setIsTranscribing] = useState(false)
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])

  const completeStep5 = useMutation(
    api.private.onboarding.completeStep5BusinessRules
  )
  const skipStep = useMutation(api.private.onboarding.skipStep)
  const transcribeAudio = useAction(api.public.transcribeAudio.transcribeAudio)

  const startRecording = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const mediaRecorder = new MediaRecorder(stream)
      mediaRecorderRef.current = mediaRecorder
      chunksRef.current = []

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          chunksRef.current.push(e.data)
        }
      }

      mediaRecorder.onstop = async () => {
        const blob = new Blob(chunksRef.current, { type: "audio/webm" })
        setAudioBlob(blob)
        for (const track of stream.getTracks()) {
          track.stop()
        }

        setIsTranscribing(true)
        try {
          const arrayBuffer = await blob.arrayBuffer()
          const result = await transcribeAudio({
            audioData: arrayBuffer,
            mimeType: "audio/webm",
          })
          setTranscription(result.transcription)
          toast.success("Audio transcrito correctamente")
        } catch (error) {
          console.error("Error transcribing audio:", error)
          setTranscription("")
          toast.error("Error al transcribir el audio. Intenta de nuevo.")
        } finally {
          setIsTranscribing(false)
        }
      }

      mediaRecorder.start()
      setIsRecording(true)
      toast.info("Grabando... Habla sobre las reglas de tu negocio")
    } catch (error) {
      console.error("Error accessing microphone:", error)
      toast.error("No se pudo acceder al micrófono")
    }
  }, [transcribeAudio])

  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop()
      setIsRecording(false)
    }
  }, [isRecording])

  const handleConfirm = async () => {
    if (!organizationId) return

    const hasContent = rulesText.trim() || audioBlob

    if (!hasContent) {
      toast.error("Por favor ingresa al menos una regla de negocio")
      return
    }

    setIsSubmitting(true)

    try {
      await completeStep5({
        organizationId: organizationId,
        rulesText: rulesText.trim() || undefined,
        transcription: transcription || undefined,
      })

      toast.success("Reglas de negocio guardadas")
      onComplete()
    } catch (error) {
      console.error("Error saving rules:", error)
      toast.error("Error al guardar las reglas")
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleSkip = async () => {
    if (!organizationId) return
    try {
      await skipStep({
        organizationId: organizationId,
        step: 6,
      })
      onSkip()
    } catch (error) {
      console.error("Error skipping step:", error)
      toast.error("Error al omitir el paso")
    }
  }

  const EXAMPLE_RULES = [
    "No aceptamos pedidos después de las 10pm",
    "Pedido mínimo de $30.000 para domicilio",
    "Los combos no aplican con otras promociones",
    "Tiempo de entrega estimado: 30-45 minutos",
    "Aceptamos pagos en efectivo, tarjeta y Nequi",
  ]

  return (
    <div className="space-y-6">
      <div>
        <h2 className="font-bold text-2xl tracking-tight">
          Reglas del Negocio
        </h2>
        <p className="text-muted-foreground">
          Cuéntanos las reglas y políticas de tu restaurante para que el bot las
          tenga en cuenta.
        </p>
      </div>

      <div className="flex gap-2">
        <Button
          variant={inputMode === "text" ? "default" : "outline"}
          onClick={() => setInputMode("text")}
          className="flex-1"
        >
          <PenLineIcon className="mr-2 h-4 w-4" />
          Escribir
        </Button>
        <Button
          variant={inputMode === "audio" ? "default" : "outline"}
          onClick={() => setInputMode("audio")}
          className="flex-1"
        >
          <MicIcon className="mr-2 h-4 w-4" />
          Grabar Audio
        </Button>
      </div>

      {inputMode === "text" ? (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <BookOpenIcon className="h-5 w-5" />
              Escribe tus reglas
            </CardTitle>
            <CardDescription>
              Incluye políticas de pedidos, horarios especiales, restricciones,
              etc.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="rules">Reglas y políticas</Label>
              <Textarea
                id="rules"
                value={rulesText}
                onChange={(e) => setRulesText(e.target.value)}
                placeholder="Escribe aquí las reglas de tu negocio..."
                className="min-h-[200px]"
              />
            </div>

            <div className="rounded-lg bg-muted/50 p-4">
              <p className="mb-2 font-medium text-sm">Ejemplos de reglas:</p>
              <ul className="space-y-1 text-muted-foreground text-sm">
                {EXAMPLE_RULES.map((rule, index) => (
                  <li key={index} className="flex items-start gap-2">
                    <span className="text-primary">•</span>
                    {rule}
                  </li>
                ))}
              </ul>
            </div>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <MicIcon className="h-5 w-5" />
              Graba tus reglas
            </CardTitle>
            <CardDescription>
              Habla naturalmente sobre las políticas de tu restaurante y las
              transcribiremos automáticamente.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-col items-center justify-center py-8">
              {isRecording ? (
                <div className="space-y-4 text-center">
                  <div className="relative mx-auto h-20 w-20">
                    <div className="absolute inset-0 animate-ping rounded-full bg-red-500/30" />
                    <div className="relative flex h-20 w-20 items-center justify-center rounded-full bg-red-500">
                      <MicIcon className="h-8 w-8 text-white" />
                    </div>
                  </div>
                  <p className="text-muted-foreground">Grabando...</p>
                  <Button variant="destructive" onClick={stopRecording}>
                    <StopCircleIcon className="mr-2 h-4 w-4" />
                    Detener grabación
                  </Button>
                </div>
              ) : audioBlob ? (
                <div className="w-full space-y-4">
                  <div className="flex items-center justify-center gap-4">
                    <div className="flex h-16 w-16 items-center justify-center rounded-full bg-green-100 dark:bg-green-900/30">
                      <MicIcon className="h-8 w-8 text-green-600" />
                    </div>
                    <div>
                      <p className="font-medium">Audio grabado</p>
                      <p className="text-muted-foreground text-sm">
                        {(audioBlob.size / 1024).toFixed(1)} KB
                      </p>
                    </div>
                  </div>
                  {isTranscribing ? (
                    <div className="flex items-center justify-center gap-2 rounded-lg bg-muted/50 p-4">
                      <Loader2Icon className="h-4 w-4 animate-spin" />
                      <p className="text-muted-foreground text-sm">
                        Transcribiendo audio...
                      </p>
                    </div>
                  ) : transcription ? (
                    <div className="space-y-2">
                      <Label htmlFor="transcription">
                        Transcripción (puedes editar)
                      </Label>
                      <Textarea
                        id="transcription"
                        value={transcription}
                        onChange={(e) => setTranscription(e.target.value)}
                        className="min-h-[150px]"
                      />
                    </div>
                  ) : null}
                  <Button
                    variant="outline"
                    onClick={() => {
                      setAudioBlob(null)
                      setTranscription("")
                    }}
                    className="w-full"
                    disabled={isTranscribing}
                  >
                    Grabar de nuevo
                  </Button>
                </div>
              ) : (
                <div className="space-y-4 text-center">
                  <Button
                    size="lg"
                    onClick={startRecording}
                    className="h-20 w-20 rounded-full"
                  >
                    <MicIcon className="h-8 w-8" />
                  </Button>
                  <p className="text-muted-foreground">
                    Presiona para comenzar a grabar
                  </p>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      <div className="flex justify-between pt-4">
        <div className="flex gap-3">
          <Button variant="ghost" onClick={onBack}>
            <ArrowLeftIcon className="mr-2 h-4 w-4" />
            Atrás
          </Button>
          <Button variant="ghost" onClick={handleSkip}>
            Omitir
          </Button>
        </div>
        <Button
          onClick={handleConfirm}
          disabled={isSubmitting || isTranscribing}
        >
          {isSubmitting && (
            <Loader2Icon className="mr-2 h-4 w-4 animate-spin" />
          )}
          Guardar y Finalizar
        </Button>
      </div>
    </div>
  )
}
