"use client";

import {
	Card,
} from "@workspace/ui/components/card"
import { DataViewerLayout } from "@workspace/ui/layout/data-viewer-layout"
import { useEffect, useState } from "react";
import { Button } from "@workspace/ui/components/button"


export const ViewTest = () => {

	const [name, setNameValue] = useState("")

	useEffect(() => {
		console.log("Se ejecuta solo una vez");
	}, [name]);

	function showMessage() {
		console.log('show message i get it')
		setNameValue('Este es el nuevo nombre para mostrar en el DOM')
	}

	return(
		<>
			<Card>
				<Button variant="default" onClick={showMessage}>Change value</Button>
				<p>Contenido</p>
				<p>Contenido</p>
				<p>{ name }</p>
			</Card>
		</>
	)
}