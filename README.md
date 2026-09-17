# UMayor-INGT1037-Proyecto

Prototipo de factibilidad de **LabMotion**, el laboratorio portatil de movimiento y cinematica del Grupo 1.

La pagina convierte un smartphone compatible en un instrumento experimental usando las APIs de sensores del navegador:

- `DeviceMotionEvent` para aceleracion y velocidad angular.
- `DeviceOrientationEvent` para registrar la orientacion del equipo.
- Canvas nativo para graficar sin librerias externas.
- Exportacion local de las muestras en CSV y JSON.

## Desarrollo

Requiere Node.js 22 o superior y pnpm.

```bash
pnpm install
pnpm dev
```

La pagina se abre en `http://localhost:4173`. Los sensores moviles normalmente requieren un contexto seguro; la prueba real se realiza en `https://labmotion.iroak.dev`.

## Produccion

El `Dockerfile` construye la SPA con Vite y la sirve con nginx. El contenedor escucha en el puerto `80` y tiene fallback para rutas de la SPA, compresion gzip y cache de assets con hash.

## Uso en la demostracion

1. Abrir `https://labmotion.iroak.dev` desde un telefono.
2. Entrar a **Diagnostico** y comprobar el contexto HTTPS.
3. Presionar **Activar sensores** aceptando el permiso si el sistema lo solicita.
4. Entrar a **Medir**, elegir **Aceleracion y frenado** e iniciar una corrida.
5. Mover el telefono, detener y revisar **Graficos**.
6. Descargar el CSV si se necesita adjuntar evidencia al informe.

Las muestras permanecen en memoria del navegador. No hay backend, autenticacion ni envio de telemetria.
