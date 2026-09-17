# UMayor-INGT1037-LabMotion

Demostrador de instrumentacion abierta de **LabMotion**, el laboratorio web de movimiento y cinematica del Grupo 1.

La pagina convierte un smartphone compatible en un instrumento de medicion usando las APIs de sensores del navegador. El catalogo separa las senales que llegan directamente del dispositivo de las magnitudes que LabMotion calcula con formulas visibles:

- `DeviceMotionEvent` para aceleracion y velocidad angular.
- `DeviceOrientationEvent` para registrar la orientacion del equipo.
- Calculos de magnitud, gravedad estimada, inclinacion, frecuencia, velocidad, posicion y angulo girado.
- Canvas nativo para graficar sin librerias externas.
- Exportacion local de las muestras en CSV y JSON.

GPS, camara y microfono quedan documentados como fuentes posibles para una siguiente implementacion. El navegador no expone una ruta portable para barometro y magnetometro.

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
4. Entrar a **Capturar** e iniciar una serie de muestras.
5. Mover el telefono, detener y revisar **Magnitudes** y **Graficos**.
6. Abrir el codigo de una formula para explicar como se calcula.
7. Descargar el CSV si se necesita adjuntar evidencia al informe.

Las muestras permanecen en memoria del navegador. No hay backend, autenticacion ni envio de telemetria.
