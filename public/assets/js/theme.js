// Applies the saved choices before the page paints, so there is no flash:
// light/dark (Modern theme) and Classic/Modern look.
(function () {
  try {
    var t = localStorage.getItem('zb_theme');
    if (t === 'light' || t === 'dark') document.documentElement.setAttribute('data-theme', t);
  } catch (e) { /* storage blocked: follow the device setting */ }
  var ui = 'classic';
  try {
    if (localStorage.getItem('zb_ui') === 'modern') ui = 'modern';
  } catch (e) { /* storage blocked: Classic */ }
  document.documentElement.setAttribute('data-ui', ui);
})();
