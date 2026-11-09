---
type: Decisiones
title: Decisiones de diseño
description: Decisiones visibles en el código, el README y el historial.
timestamp: 2026-11-06
---

## D-01: Separar API, lógica y datos

- **Qué se decidió:** Mantener módulos separados para API, lógica y persistencia.
- **Por qué:** El README describe una arquitectura por capas.
- **Estado:** vigente.

## D-02: Evolucionar de memoria a SQLite

- **Qué se decidió:** Sustituir el almacenamiento en memoria por SQLite.
- **Por qué:** El commit `f7443e8` y el README describen la persistencia relacional.
- **Estado:** vigente; en producción la base SQLite está en Turso (ver D-15).

## D-03: Usar JWT y `localStorage` para la sesión

- **Qué se decidió:** Emitir JWT y conservarlo en el navegador.
- **Por qué:** El README y el commit `1e8f9e2` documentan esta implementación.
- **Estado:** vigente.

## D-04: Proteger rutas mediante RBAC

- **Qué se decidió:** Restringir el listado de usuarios al rol `admin`.
- **Por qué:** El README y [servidor/api.js](../servidor/api.js) muestran el middleware de rol.
- **Estado:** vigente.

## D-05: Configurar dominios permitidos

- **Qué se decidió:** Leer los dominios permitidos desde `ALLOWED_DOMAINS`.
- **Por qué:** El commit `c2b7fea` se titula “variante 3 implementada”.
- **Estado:** revertida. El commit `0838925` (“Revert "Implementada variante 3"”, PR `#15`) la retiró y ya no está en el código.

## D-06: Alta automática del administrador

- **Qué se decidió:** Crear el administrador al arrancar si está configurado `ADMIN_PASSWORD`.
- **Por qué:** El commit `8718f29` y [servidor/logica.js](../servidor/logica.js) lo documentan.
- **Estado:** vigente.

Las decisiones D-07 a D-13 del dominio del Sprint 2 están en la especificación de requisitos del Sprint 2.

## D-14: Correo de confirmación mediante la API HTTP de Brevo

- **Qué se decidió:** Enviar el correo de confirmación con la API HTTP de Brevo desde un adaptador inyectado en la lógica ([servidor/correo.js](../servidor/correo.js)). El token es de un solo uso y caduca a las 24 horas.
- **Por qué:** Algunos proveedores cloud con capa gratuita bloquean los puertos SMTP salientes; la API HTTP usa el puerto 443. Inyectar el adaptador permite usar un doble en las pruebas.
- **Estado:** vigente. Sustituye al planteamiento inicial con Gmail SMTP.

## D-15: Base de datos gestionada en Turso

- **Qué se decidió:** Usar Turso (SQLite gestionado con libSQL) como base de datos de producción mediante `@libsql/client`, conservando el mismo esquema y SQL.
- **Por qué:** El sistema de archivos de Cloud Run es efímero y el archivo SQLite se perdía en cada despliegue o reinicio (RNF-09). Turso es compatible con SQLite y tiene capa gratuita, así que solo cambió la capa de datos y la lógica no se tocó (D-01).
- **Estado:** vigente.

## D-16: Sin secreto JWT de respaldo

- **Qué se decidió:** Eliminar el valor por defecto de `JWT_SECRET`; el servidor no arranca sin él.
- **Por qué:** Un secreto escrito en el código es público en el repositorio y permitiría falsificar tokens si faltara la variable en producción (RNF-02).
- **Estado:** vigente.

## D-17: Reactivar las cuentas eliminadas al volver a registrarse

- **Qué se decidió:** Si alguien se registra con el email de una cuenta eliminada, se reutiliza esa misma fila: contraseña nueva, rol `profesional`, estado `pendiente` y nuevo correo de confirmación (RN-11). Cualquier cuenta eliminada se puede reactivar, la haya eliminado su dueño o el administrador.
- **Por qué:** El borrado lógico (D-13) deja el email ocupado; sin reactivación, quien elimina su cuenta no podría volver con su correo. Reutilizar la fila conserva la trazabilidad y facilita las pruebas manuales sin crear cuentas de correo nuevas.
- **Consecuencia:** Eliminar una cuenta no impide que su dueño vuelva; el administrador no tiene un mecanismo de bloqueo permanente.
- **Estado:** vigente.

## D-18: Comprobar la sesión contra la base de datos en cada petición

- **Qué se decidió:** El middleware de autenticación, además de verificar el JWT, comprueba que la cuenta sigue activa y toma el rol de la base de datos.
- **Por qué:** RN-08 exige que un usuario eliminado deje de poder usar la aplicación; un JWT seguiría siendo válido hasta caducar (2 h). El coste es una consulta por petición protegida.
- **Estado:** vigente.

## D-19: Catálogo reducido de ciudades

- **Qué se decidió:** Cargar 145 ciudades en lugar de los más de 8.000 municipios de España: las 50 capitales de provincia, Ceuta, Melilla y las ciudades más pobladas de cada provincia, cada una con su provincia ([servidor/catalogos.js](../servidor/catalogos.js)).
- **Por qué:** El objetivo del sprint es el funcionamiento del directorio, no la exhaustividad del catálogo. Se escribe a mano sin depender de un archivo externo y se puede ampliar sin migraciones: las ciudades se insertan con `INSERT OR IGNORE` en cada arranque.
- **Desviación:** La especificación (apartado 3.3) pide el catálogo de municipios de España. Para cumplirla basta con sustituir la lista por la relación de municipios del INE.
- **Estado:** vigente.

## D-20: Unicidad de sectores con un nombre normalizado

- **Qué se decidió:** Guardar junto al nombre del sector una versión sin mayúsculas ni tildes con un índice `UNIQUE`, además de comprobarlo en la lógica.
- **Por qué:** RN-05 debe cumplirse aunque dos peticiones lleguen a la vez; la lógica da el mensaje de error y la base de datos es la última barrera.
- **Estado:** vigente.

## D-21: El perfil se guarda completo en una sola petición

- **Qué se decidió:** `PUT /api/perfil` recibe a la vez los datos del negocio, los sectores con su especialidad y las ciudades, y sustituye las listas enteras. La ruta no lleva id: el perfil siempre es el del usuario de la sesión.
- **Por qué:** La página tiene un solo botón «Guardar perfil»; validar todo antes de escribir evita perfiles a medias. Sin id en la ruta, RN-02 se cumple por construcción.
- **Estado:** vigente.

## D-22: Conservar un sector desactivado que el profesional ya tenía

- **Qué se decidió:** Un profesional no puede añadir un sector desactivado (RN-04), pero si ya lo tenía puede seguir guardando su perfil sin perderlo.
- **Por qué:** Si el administrador desactiva un sector, obligar a quitarlo para poder editar cualquier otro dato borraría además sus servicios (RN-03). El sector ya queda oculto del buscador.
- **Estado:** vigente.

## D-23: Identidad visual en verde pino, sobria y minimalista

- **Qué se decidió:** Sustituir la estética del Sprint 1 (tarjeta centrada sobre gris y azul genérico) por una identidad propia: el verde pino (`#24493D`, y `#17302A` en la barra y las cabeceras) como color de marca, fondo salvia muy suave con bloques blancos, la serif Lora solo para la marca y los títulos y la fuente del sistema para el resto. La página de acceso se dirige al profesional y le enseña una ficha de ejemplo; «Mi perfil» muestra una vista previa en vivo de su ficha y el progreso de lo que le falta. La marca provisional es «Oficios».
- **Por qué:** Los profesionales tienen que querer publicar su ficha y los clientes tienen que fiarse de ella: la interfaz debe transmitir seriedad sin resultar fría. Un único color de marca y pocos elementos mantienen la atención en el contenido.
- **Organización:** Los estilos se reparten en `cliente/css/` (`base.css` común, `ficha.css` para la ficha reutilizable y uno por página) y el JavaScript de cada página está en su propio archivo (`perfil.js`, `admin.js`), de modo que los HTML solo contienen estructura.
- **Estado:** vigente.

## D-24: Logo y fotos de trabajos guardados en la base de datos

- **Qué se decidió:** Permitir al profesional publicar, de forma opcional, el logo de su empresa y hasta 8 fotos de sus trabajos (RF-23). Las imágenes se guardan en la propia base de datos (Turso), en una tabla `imagenes` con el contenido en un `BLOB`, y se sirven desde `GET /api/imagenes/:id`. El navegador las reduce antes de subirlas (logo a 512 px en WebP, fotos a 1.600 px en JPG) y el servidor acepta como máximo 600 KB por imagen.
- **Por qué:** Es una ampliación del alcance pedida para que las fichas resulten más profesionales y den confianza. La especificación dejaba fuera la subida de imágenes porque el disco de Cloud Run es efímero; guardarlas en Turso, que ya es persistente, evita ese problema sin añadir otro servicio (como Cloud Storage) ni dependencias nuevas. Con los límites de tamaño y número, el espacio que ocupan es pequeño frente a los 5 GB del plan gratuito.
- **Consecuencias:** Cada imagen pasa por el servidor y la base de datos; con mucho tráfico convendría un almacenamiento de objetos con CDN. El formato se valida por los primeros bytes del archivo y las imágenes de cuentas eliminadas dejan de servirse (RN-08).
- **Estado:** vigente. Sustituye a la exclusión de «Subida de imágenes o logotipos» del apartado 8 de la especificación del Sprint 2.

## D-25: Importes guardados en céntimos

- **Qué se decidió:** Guardar el importe de cada servicio y el precio de la visita como números enteros de céntimos. La API recibe y devuelve euros («45,50», «45.5» o 45.5) y la lógica los convierte, aceptando como mucho dos decimales.
- **Por qué:** Los números decimales en coma flotante no representan exactamente cantidades como 0,10 €; con enteros, comparar y ordenar por precio (RF-19, RF-20) es exacto.
- **Estado:** vigente.

## D-26: Sexto tipo de precio, «presupuesto cerrado»

- **Qué se decidió:** Añadir a los cinco tipos de precio de la especificación (apartado 3.2) el **presupuesto cerrado**: el profesional se compromete a dar un precio final tras ver el trabajo. Indica si el presupuesto es gratuito y, si no lo es, puede indicar el precio de la visita. No lleva importe del servicio.
- **Por qué:** Muchos oficios trabajan así y para el cliente es una garantía distinta de «a consultar», que no compromete a nada. Se mantienen los dos.
- **Consecuencias:** Como «a consultar», no tiene importe comparable: al ordenar por precio aparecerá al final (apartado 4.4). Hay que añadir la fila a la tabla 3.2 de la especificación.
- **Estado:** vigente.

## D-27: Confirmación en el servidor al quitar sectores con servicios

- **Qué se decidió:** Si al guardar el perfil se quitan sectores que tienen servicios, `PUT /api/perfil` responde 409 con la lista de servicios afectados y no cambia nada; solo los borra si la petición repite el envío con `confirmarBorrado: true`. La página muestra esa lista y pide confirmación.
- **Por qué:** RN-03 exige confirmación previa. Hacerlo en el servidor garantiza que ningún cliente borre servicios sin haberlo confirmado, y la lista viene del servidor, que es quien sabe qué servicios se perderían.
- **Estado:** vigente.

## D-28: RN-01 definida una sola vez, en SQL

- **Qué se decidió:** La condición de «perfil publicado» es un único fragmento SQL (`PERFIL_PUBLICADO` en `servidor/datos.js`) que usan el buscador y la ficha pública. «Mi perfil» calcula en la lógica qué falta (RF-16) con los mismos cinco criterios, y las pruebas comprueban que ambos coinciden.
- **Por qué:** Si la regla estuviera repetida, el buscador y la ficha podrían discrepar. Al aplicarla en la consulta, los perfiles incompletos no llegan ni a contarse, y la paginación es correcta.
- **Estado:** vigente.

## D-29: El buscador es la página principal

- **Qué se decidió:** `/` es el buscador público; el inicio de sesión y el registro de profesionales pasan a `/acceso.html`, al que se llega con el botón «Acceso profesionales» de la barra (que muestra «Mi perfil» o «Administración» si ya hay sesión).
- **Por qué:** Quien llega a la web es sobre todo el cliente que busca un profesional, y no tiene cuenta (D-11).
- **Estado:** vigente.

## D-30: Criterios del filtro de precio y del orden

- **Qué se decidió:** Con importe máximo solo cuentan los servicios que tienen importe y no lo superan: los «a consultar» y los de presupuesto cerrado se ocultan, porque no se puede garantizar que no lo superen; los «desde» cuentan con su importe mínimo. El orden por defecto es por precio ascendente, y los perfiles sin precio de referencia van al final en los dos órdenes por precio. Cada búsqueda es de una sola ciudad.
- **Por qué:** El criterio de aceptación pide que ningún servicio mostrado supere el importe máximo (apartado 9.1), y el apartado 4.4 pide que los perfiles sin precio vayan al final.
- **Estado:** vigente.

## D-31: Controles de formulario propios

- **Qué se decidió:** Sustituir los controles que dibuja el navegador, que no seguían el diseño de la web:
  - **Desplegables:** cada `<select>` se acompaña de un botón y una lista propios (`cliente/interfaz.js`). La lista es un menú verde pino translúcido con desenfoque, con halo verde y animación al abrirse, y marca con ✓ la opción elegida. El autocompletado de ciudades usa el mismo menú. Se maneja también con el teclado (flechas, Inicio/Fin, Enter, Escape y la inicial de una opción).
  - **Casillas:** cuadradas con esquinas suaves, verde pino con ✓ blanco al marcarse.
  - **Confirmaciones:** en vez de la ventana del navegador, el botón de borrar se convierte en «¿Borrar? Sí / No» en el mismo sitio; el aviso de RN-03 al quitar sectores con servicios aparece como un bloque dentro de la página. Renombrar un sector sigue usando el cuadro del navegador.
- **Por qué:** La lista de un `<select>` y las ventanas `confirm()` las dibuja el sistema operativo y no se pueden adaptar con CSS; rompían la estética de la web (D-23).
- **Cómo se mantiene el código:** El `<select>` original sigue en la página, oculto, y guarda el valor. El componente redefine `value` y `selectedIndex` en ese elemento y observa sus opciones, así que el resto del código sigue leyendo y asignando `select.value`, sustituyendo opciones y escuchando `change` sin cambios.
- **Estado:** vigente.

## D-32: Una sola tarjeta de profesional

- **Qué se decidió:** La tarjeta del profesional se dibuja con una única función (`crearTarjeta`, en `cliente/publico.js`) que usan la vista previa de «Mi perfil», los resultados del buscador y la ficha de ejemplo de la página de acceso. Incluye logo o iniciales, nombre, zona, hasta tres fotos, descripción, oficios con su especialidad, medios de contacto, hasta tres servicios con su precio y el pie con el precio de referencia. `GET /api/profesionales` devuelve para cada resultado la descripción, las especialidades, los medios de contacto publicados y las tres primeras fotos.
- **Por qué:** La vista previa promete al profesional «así te verán los clientes»; con dos tarjetas distintas esa promesa no se cumplía. Con una sola función, no pueden volver a diferenciarse.
- **Diferencia intencionada:** En el buscador los servicios mostrados son solo los que cumplen los filtros (apartado 4.4); en la vista previa aparecen todos.
- **Estado:** vigente.

Para cualquier motivo no citado aquí: **TODO(alumno): indicar la fuente concreta de la decisión.**
