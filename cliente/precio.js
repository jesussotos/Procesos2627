// Formato de los precios de un servicio. Lo comparten «Mi perfil» y, más adelante, el buscador y la ficha pública.
// Los importes llegan en euros desde la API (en la base de datos se guardan en céntimos, D-25).
const Precio = (() => {
  const TIPOS = {
    fijo: 'Precio fijo',
    hora: 'Por hora',
    unidad: 'Por unidad',
    desde: 'Desde',
    consultar: 'A consultar',
    presupuesto: 'Presupuesto cerrado'
  };
  const CON_IMPORTE = ['fijo', 'hora', 'unidad', 'desde'];

  function crearFormato(decimales) {
    const opciones = { minimumFractionDigits: decimales, maximumFractionDigits: decimales };
    try {
      return new Intl.NumberFormat('es-ES', { ...opciones, useGrouping: 'always' }); // 3.000 y no 3000
    } catch (error) {
      return new Intl.NumberFormat('es-ES', opciones); // navegadores antiguos
    }
  }
  const sinDecimales = crearFormato(0);
  const conDecimales = crearFormato(2);

  function euros(importe) {
    const formato = Number.isInteger(importe) ? sinDecimales : conDecimales;
    return `${formato.format(importe)} €`;
  }

  // «45,50 €», «25 €/hora», «22 €/m²», «desde 3.000 €», «A consultar», «Presupuesto cerrado gratis»...
  function texto(servicio) {
    switch (servicio.tipoPrecio) {
      case 'fijo': return euros(servicio.importe);
      case 'hora': return `${euros(servicio.importe)}/hora`;
      case 'unidad': return `${euros(servicio.importe)}/${servicio.unidad}`;
      case 'desde': return `desde ${euros(servicio.importe)}`;
      case 'consultar': return 'A consultar';
      case 'presupuesto':
        if (servicio.presupuestoGratis) return 'Presupuesto gratis';
        if (servicio.precioVisita) return `Presupuesto, visita ${euros(servicio.precioVisita)}`;
        return 'Presupuesto cerrado';
      default: return '';
    }
  }

  // Nota sobre el IVA, solo para los precios con importe
  function iva(servicio, corta = false) {
    if (!CON_IMPORTE.includes(servicio.tipoPrecio)) return '';
    if (corta) return servicio.ivaIncluido ? 'IVA incl.' : '+ IVA';
    return servicio.ivaIncluido ? 'IVA incluido' : 'IVA no incluido';
  }

  // Precio de referencia (apartado 4.4): el menor importe entre los servicios que tienen uno
  function referencia(servicios) {
    const importes = servicios.filter(s => CON_IMPORTE.includes(s.tipoPrecio)).map(s => s.importe);
    return importes.length ? Math.min(...importes) : null;
  }

  return { TIPOS, CON_IMPORTE, euros, texto, iva, referencia };
})();
