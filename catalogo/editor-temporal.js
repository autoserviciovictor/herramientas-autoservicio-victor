/* TEMPORAL: borrar este script y editor-temporal.css antes de publicar. */
(() => {
  'use strict';
  const API = 'https://inventario-victor-api.onrender.com';
  // La APP guarda el token en el almacenamiento de su mismo origen (127.0.0.1:5500).
  const TOKEN_KEY = 'autoservicio_session_token';
  const USER_KEY = 'autoservicio_session_user';
  function credenciales() {
    for (const storage of [sessionStorage, localStorage]) {
      const token = storage.getItem(TOKEN_KEY);
      if (!token) continue;
      let usuario = null;
      try { usuario = JSON.parse(storage.getItem(USER_KEY) || 'null'); } catch {}
      if (['administrador','administracion'].includes(usuario?.rol)) return token;
    }
    return '';
  }
  let habilitado = false;
  let codigoActivo = '';
  let imagenPendiente = null;
  const productosOcultados=new Set();
  function quitarTarjetasOcultas(){
    if(!productosOcultados.size)return;
    document.querySelectorAll('.product-card[data-product]').forEach(card=>{
      if(productosOcultados.has(String(card.dataset.product)))card.remove();
    });
  }
  const $ = id => document.getElementById(id);
  const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  async function solicitud(ruta, opciones={}) {
    const token = credenciales();
    if (!token) throw new Error('Ingresá a la APP como Administrador o Administración para editar.');
    const respuesta = await fetch(`${API}${ruta}`, {...opciones, headers:{Accept:'application/json',Authorization:`Bearer ${token}`,...(opciones.body ? {'Content-Type':'application/json'} : {}),...(opciones.headers||{})}});
    const datos = await respuesta.json().catch(()=>({}));
    if(!respuesta.ok || datos.ok===false) throw new Error(datos.mensaje || `Error ${respuesta.status}`);
    return datos;
  }
  function crearModal() {
    const fondo = document.createElement('div'); fondo.className='temp-editor-backdrop'; fondo.id='tempEditorBackdrop'; fondo.hidden=true;
    fondo.innerHTML=`<section class="temp-editor" role="dialog" aria-modal="true" aria-labelledby="tempEditorTitle">
      <header class="temp-editor-header"><div class="temp-editor-heading"><span class="temp-editor-icon">▣</span><div><small>CATÁLOGO</small><h2 id="tempEditorTitle">Editar producto</h2><p id="tempEditorCodigo"></p></div></div><button type="button" id="tempEditorCerrar" aria-label="Cerrar">✕</button></header>
      <div class="temp-editor-body">
        <section class="temp-editor-panel temp-editor-image-panel">
          <div class="temp-editor-image-head"><div><strong>Imagen del producto</strong><small>Podés cargar una imagen desde tu PC para probar cómo se verá en el catálogo.</small></div><span id="tempEditorEstadoImagen" class="temp-editor-image-state">Sin imagen</span></div>
          <div class="temp-editor-preview"><img id="tempEditorImagen" alt="Imagen del producto"></div>
          <div class="temp-editor-image-actions"><label class="temp-editor-upload">Cargar desde mi PC <input type="file" id="tempEditorArchivo" accept="image/png,image/jpeg,image/webp" hidden></label><button type="button" id="tempEditorBuscarImagen">Buscar imagen</button><button type="button" id="tempEditorQuitarImagen">Quitar imagen</button></div>
          <p class="temp-editor-image-meta" id="tempEditorImagenAviso">Todavía no se cargó una imagen para este producto.</p>
        </section>
        <div class="temp-editor-right">
          <section class="temp-editor-panel"><h3>Información del producto</h3>
            <div class="temp-editor-fields"><label class="wide">Nombre del producto *<input id="tempEditorNombre" maxlength="220" required></label><label>Precio *<span class="temp-editor-price"><b>$</b><input id="tempEditorPrecio" type="number" min="0" step="0.01" required></span></label><label>Precio de oferta<span class="temp-editor-price"><b>$</b><input id="tempEditorPrecioOferta" type="number" min="0" step="0.01" placeholder="Sin oferta"></span></label><label>Rubro<select id="tempEditorRubro"></select></label><label>Marca<input id="tempEditorMarca" maxlength="120" placeholder="Ej.: Coca-Cola"></label><label>Presentación<input id="tempEditorPresentacion" maxlength="120" placeholder="Ej.: 2,25 L"></label><label>Unidad de venta<select id="tempEditorUnidad"><option value="unidad">Unidad</option><option value="kg">Kg</option><option value="pack">Pack</option><option value="cajon">Cajón</option><option value="bulto">Bulto</option><option value="litro">Litro</option><option value="metro">Metro</option></select></label></div>
          </section>
          <section class="temp-editor-panel"><h3>Opciones de visibilidad y destaque</h3><div class="temp-editor-checks">
            <label><input id="tempEditorVisible" type="checkbox"><span class="temp-editor-switch"></span><span><strong>Visible para clientes</strong><small>El producto podrá aparecer en el catálogo público cuando tenga un rubro activo.</small></span></label>
            <label><input id="tempEditorDestacado" type="checkbox"><span class="temp-editor-switch"></span><span><strong>Producto destacado</strong><small>Aparecerá en Ofertas y usará el precio de oferta cuando esté definido.</small></span></label>
          </div></section>
        </div>
      </div>
      <footer class="temp-editor-footer"><span id="tempEditorMensaje" class="temp-editor-message" role="status"></span><button type="button" id="tempEditorCancelar">Cancelar</button><button type="button" class="primary" id="tempEditorGuardar">Guardar cambios</button></footer></section>`;
    document.body.append(fondo);
    const cerrar=()=>{fondo.hidden=true; imagenPendiente=null;};
    $('tempEditorCerrar').onclick=cerrar; $('tempEditorCancelar').onclick=cerrar;
    fondo.addEventListener('click', e=>{if(e.target===fondo) cerrar();});
    document.addEventListener('keydown',e=>{if(e.key==='Escape'&&!fondo.hidden) cerrar();});
    $('tempEditorArchivo').onchange=e=>{const f=e.target.files?.[0];if(!f)return;if(f.size>8*1024*1024){$('tempEditorImagenAviso').textContent='Máximo 8 MB';return;}imagenPendiente=f; $('tempEditorImagen').src=URL.createObjectURL(f);$('tempEditorImagenAviso').textContent='La imagen se cargará al guardar.';$('tempEditorEstadoImagen').textContent='Imagen nueva';};
    $('tempEditorQuitarImagen').onclick=async()=>{if(!confirm('¿Quitar la imagen de este producto?'))return;try{await solicitud(`/admin/catalogo/productos/${encodeURIComponent(codigoActivo)}/imagen`,{method:'DELETE'});$('tempEditorImagen').removeAttribute('src');$('tempEditorImagenAviso').textContent='Imagen eliminada.';$('tempEditorEstadoImagen').textContent='Sin imagen';}catch(e){$('tempEditorImagenAviso').textContent=e.message;}};
    $('tempEditorBuscarImagen').onclick=()=> {
      const nombre=$('tempEditorNombre').value.trim();
      if(!nombre)return;
      window.open('https://www.google.com/search?tbm=isch&q='+encodeURIComponent(nombre+' producto'), '_blank', 'noopener,noreferrer');
      $('tempEditorImagenAviso').textContent='Buscá una imagen y guardala en tu PC; después usá «Cargar desde mi PC».';
    };
    $('tempEditorGuardar').onclick=guardar;
  }
  async function abrir(codigo){
    codigoActivo=codigo; imagenPendiente=null;
    $('tempEditorMensaje').textContent='Cargando...'; $('tempEditorBackdrop').hidden=false;
    try{
      const {producto:p}=await solicitud(`/admin/catalogo/productos/${encodeURIComponent(codigo)}`);
      $('tempEditorCodigo').textContent=`Código: ${p.codigo}`;
      for(const [id,val] of Object.entries({Nombre:p.nombre,Precio:p.precio,Rubro:p.rubroId,Marca:p.marca,Presentacion:p.presentacion,Unidad:p.unidadVenta||'unidad'})) $( 'tempEditor'+id).value=val??'';
      $('tempEditorPrecioOferta').value=p.precioOferta??'';
      $('tempEditorVisible').checked=!!p.visible; $('tempEditorDestacado').checked=!!p.destacado;
      if(!p.visible)productosOcultados.add(String(codigo));
      $('tempEditorImagen').src=`${API}/catalogo/api/productos/${encodeURIComponent(codigo)}/imagen?t=${Date.now()}`;
      $('tempEditorImagenAviso').textContent='Imagen actual del producto.'; $('tempEditorEstadoImagen').textContent='Imagen actual'; $('tempEditorMensaje').textContent='';
    }catch(e){$('tempEditorMensaje').textContent=e.message;}
  }
  // Actualiza la tarjeta sin recargar la página ni alterar los filtros o el scroll.
  function actualizarTarjetas(producto, codigo, visible){
    const cards=[...document.querySelectorAll('.product-card[data-product]')].filter(card=>card.dataset.product===String(codigo));
    for(const card of cards){
      if(!visible){card.remove();continue;}
      const nombre=card.querySelector('.product-card__body h3');
      if(nombre){nombre.textContent=producto.nombre || $('tempEditorNombre').value;nombre.title=nombre.textContent;}
      const marca=card.querySelector('.product-card__brand');
      if(marca)marca.textContent=producto.marca || $('tempEditorMarca').value || ' ';
      const precio=card.querySelector('.product-card__price');
      if(precio){
        const normal=Number(producto.precio ?? $('tempEditorPrecio').value);
        const oferta=producto.destacado && producto.precioOferta != null ? Number(producto.precioOferta) : null;
        const vigente=oferta!==null && oferta>0 && oferta<normal ? oferta : normal;
        precio.textContent=vigente.toLocaleString('es-AR',{style:'currency',currency:'ARS'});
        card.querySelector('.product-card__old-price')?.remove();
        if(vigente<normal){const old=document.createElement('del');old.className='product-card__old-price';old.textContent=normal.toLocaleString('es-AR',{style:'currency',currency:'ARS'});precio.before(old);}
      }
      const unidad=card.querySelector('.product-card__unit');
      if(unidad)unidad.textContent=producto.unidadVenta || $('tempEditorUnidad').value;
      const destacado=card.querySelector('.product-card__featured');
      if(destacado && !$('tempEditorDestacado').checked)destacado.remove();
      if(!destacado && $('tempEditorDestacado').checked){const img=card.querySelector('.product-card__image');if(img){const b=document.createElement('span');b.className='product-card__featured';b.textContent='OFERTA';img.prepend(b);}}
      if(imagenPendiente){const img=card.querySelector('.product-card__image img');if(img)img.src=URL.createObjectURL(imagenPendiente);}
    }
  }
  function archivoDataUrl(archivo){return new Promise((resolve,reject)=>{const lector=new FileReader();lector.onload=()=>resolve(lector.result);lector.onerror=reject;lector.readAsDataURL(archivo);});}
  async function guardar(){
    const btn=$('tempEditorGuardar');btn.disabled=true;$('tempEditorMensaje').textContent='Guardando...';
    try{
      const body={nombre:$('tempEditorNombre').value,precio:$('tempEditorPrecio').value,precioOferta:$('tempEditorPrecioOferta').value,rubroId:$('tempEditorRubro').value||null,marca:$('tempEditorMarca').value,presentacion:$('tempEditorPresentacion').value,unidadVenta:$('tempEditorUnidad').value,visible:$('tempEditorVisible').checked,destacado:$('tempEditorDestacado').checked};
      const resultado=await solicitud(`/admin/catalogo/productos/${encodeURIComponent(codigoActivo)}`,{method:'PUT',body:JSON.stringify(body)});
      if(Boolean(resultado.producto?.visible)!==body.visible)throw new Error('El servidor no confirmó el cambio de visibilidad. Verificá los permisos y volvé a intentar.');
      if(imagenPendiente){const imagen=await archivoDataUrl(imagenPendiente);await solicitud(`/admin/catalogo/productos/${encodeURIComponent(codigoActivo)}/imagen/subir`,{method:'POST',body:JSON.stringify({imagen})});}
      // Volvemos a consultar el registro persistido antes de tocar el catálogo.
      const confirmado=await solicitud(`/admin/catalogo/productos/${encodeURIComponent(codigoActivo)}`);
      if(Boolean(confirmado.producto?.visible)!==body.visible)throw new Error('El cambio no quedó guardado en el servidor.');
      const esperado=body.precioOferta.trim()===''?null:Number(body.precioOferta);
      const recibido=confirmado.producto?.precioOferta==null?null:Number(confirmado.producto.precioOferta);
      if((esperado===null)!==(recibido===null)||(esperado!==null&&Math.abs(esperado-recibido)>0.009))throw new Error('El servidor no guardó el precio de oferta. Actualizá el backend en Render.');
      actualizarTarjetas(confirmado.producto,codigoActivo,body.visible);
      window.dispatchEvent(new CustomEvent('catalogo-producto-actualizado',{detail:{producto:confirmado.producto}}));
      // Las secciones se vuelven a dibujar desde datos en memoria en algunas interacciones.
      // Mantenemos el código oculto filtrado incluso ante esos redibujados.
      if(!body.visible) productosOcultados.add(String(codigoActivo));
      else productosOcultados.delete(String(codigoActivo));
      quitarTarjetasOcultas();
      $('tempEditorMensaje').textContent='Guardado correctamente';
      $('tempEditorBackdrop').hidden=true;imagenPendiente=null;
    }catch(e){$('tempEditorMensaje').textContent=e.message;}finally{btn.disabled=false;}
  }
  async function habilitar(){
    // El servidor es quien decide si existe una sesión de Administrador/Administración.
    try{
      const data=await solicitud('/admin/catalogo/rubros');
      const rubros=Array.isArray(data.rubros)?data.rubros:[];
      $('tempEditorRubro').innerHTML='<option value="">Sin rubro</option>'+rubros.map(r=>`<option value="${esc(r.id)}">${esc(r.nombre)}</option>`).join('');
      habilitado=true;
      const observer=new MutationObserver(()=>{
        quitarTarjetasOcultas();
        document.querySelectorAll('.product-card[data-product]').forEach(card=>{
          if(card.querySelector('.temp-edit-trigger'))return;
          const boton=document.createElement('button');boton.type='button';boton.className='temp-edit-trigger';boton.textContent='✎ Editar';
          boton.addEventListener('click',e=>{e.preventDefault();e.stopPropagation();abrir(card.dataset.product);});card.append(boton);
        });
      });
      observer.observe(document.body,{subtree:true,childList:true});
      document.querySelectorAll('.product-card[data-product]').forEach(card=>{const boton=document.createElement('button');boton.type='button';boton.className='temp-edit-trigger';boton.textContent='✎ Editar';boton.onclick=e=>{e.preventDefault();e.stopPropagation();abrir(card.dataset.product);};card.append(boton);});
    }catch(e){console.info('[Editor temporal] No se habilitó la edición:', e.message);}
  }
  document.addEventListener('DOMContentLoaded',()=>{crearModal();habilitar();});
})();
