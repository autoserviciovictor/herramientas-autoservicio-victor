// Reubica el buscador únicamente en celulares sin duplicar formularios ni eventos.
// En PC conserva la estructura y funcionalidad original.
(() => {
  const applyLayout = () => {
    const section = document.querySelector('.catalogo-search-section');
    const toolbar = document.querySelector('.catalogo-products-toolbar');
    const services = document.querySelector('.catalogo-services');
    if (!section || !toolbar || !services) return;
    if (window.matchMedia('(max-width: 700px)').matches) {
      if (section.previousElementSibling !== toolbar) toolbar.insertAdjacentElement('afterend', section);
    } else if (section.previousElementSibling !== services) {
      services.insertAdjacentElement('afterend', section);
    }
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', applyLayout, {once:true});
  else applyLayout();
  window.matchMedia('(max-width: 700px)').addEventListener('change', applyLayout);
})();
