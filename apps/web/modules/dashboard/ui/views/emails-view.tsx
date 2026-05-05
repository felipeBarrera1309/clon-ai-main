"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { api } from "@workspace/backend/_generated/api";
import { Button } from "@workspace/ui/components/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@workspace/ui/components/card";
import {
	Form,
	FormControl,
	FormField,
	FormItem,
	FormLabel,
	FormMessage,
} from "@workspace/ui/components/form";
import { Input } from "@workspace/ui/components/input";
import { Textarea } from "@workspace/ui/components/textarea";
import { useMutation } from "convex/react";
import { Loader2, Mail, Send } from "lucide-react";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";

const emailFormSchema = z.object({
	from: z.string().email("Email de remitente inválido"),
	to: z.string().email("Email de destinatario inválido"),
	subject: z.string().min(1, "El asunto es requerido"),
	text: z.string().min(1, "El contenido del email es requerido"),
});

type EmailFormValues = z.infer<typeof emailFormSchema>;

export function EmailsView() {
	const [isLoading, setIsLoading] = useState(false);
	const sendEmail = useMutation(api.private.emails.sendEmail);

	const form = useForm<EmailFormValues>({
		resolver: zodResolver(emailFormSchema),
		defaultValues: {
			from: "onboarding@resend.dev",
			to: "",
			subject: "",
			text: "",
		},
	});

	const onSubmit = async (values: EmailFormValues) => {
		try {
			setIsLoading(true);
			await sendEmail(values);
			toast.success("Email enviado exitosamente");
			form.reset({
				from: values.from,
				to: "",
				subject: "",
				text: "",
			});
		} catch (error) {
			console.error("Error sending email:", error);
			toast.error("Ocurrió un error al enviar el email. Intenta nuevamente.");
		} finally {
			setIsLoading(false);
		}
	};

	return (
		<div className="space-y-6">
			<div className="flex items-center gap-2">
				<Mail className="h-6 w-6" />
				<h1 className="font-bold text-2xl">Emails</h1>
			</div>

			<Card className="max-w-2xl">
				<CardHeader>
					<CardTitle>Enviar Email</CardTitle>
					<CardDescription>
						Envía emails usando el sistema de notificaciones de la plataforma.
					</CardDescription>
				</CardHeader>
				<CardContent>
					<Form {...form}>
						<form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
							<FormField
								control={form.control}
								name="from"
								render={({ field }) => (
									<FormItem>
										<FormLabel>De</FormLabel>
										<FormControl>
											<Input
												placeholder="remitente@ejemplo.com"
												type="email"
												{...field}
											/>
										</FormControl>
										<FormMessage />
									</FormItem>
								)}
							/>

							<FormField
								control={form.control}
								name="to"
								render={({ field }) => (
									<FormItem>
										<FormLabel>Para</FormLabel>
										<FormControl>
											<Input
												placeholder="destinatario@ejemplo.com"
												type="email"
												{...field}
											/>
										</FormControl>
										<FormMessage />
									</FormItem>
								)}
							/>

							<FormField
								control={form.control}
								name="subject"
								render={({ field }) => (
									<FormItem>
										<FormLabel>Asunto</FormLabel>
										<FormControl>
											<Input placeholder="Asunto del email" {...field} />
										</FormControl>
										<FormMessage />
									</FormItem>
								)}
							/>

							<FormField
								control={form.control}
								name="text"
								render={({ field }) => (
									<FormItem>
										<FormLabel>Contenido</FormLabel>
										<FormControl>
											<Textarea
												placeholder="Escribe el contenido del email aquí..."
												className="min-h-[120px]"
												{...field}
											/>
										</FormControl>
										<FormMessage />
									</FormItem>
								)}
							/>

							<Button type="submit" disabled={isLoading} className="w-full">
								{isLoading ? (
									<>
										<Loader2 className="mr-2 h-4 w-4 animate-spin" />
										Enviando...
									</>
								) : (
									<>
										<Send className="mr-2 h-4 w-4" />
										Enviar Email
									</>
								)}
							</Button>
						</form>
					</Form>
				</CardContent>
			</Card>
		</div>
	);
}
