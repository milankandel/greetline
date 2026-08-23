/* Greetline embeddable receptionist.
 * <script src="https://greetline.vercel.app/widget.js" data-agent="YOUR_PUBLIC_ID" defer></script>
 */
(function () {
  var script = document.currentScript
  var agent = script && script.getAttribute('data-agent')
  if (!agent) return
  var origin = new URL(script.src).origin

  var button = document.createElement('button')
  button.textContent = '💬 Ask us anything'
  button.style.cssText =
    'position:fixed;bottom:20px;right:20px;z-index:99999;padding:12px 18px;border-radius:999px;border:0;' +
    'background:#6d28d9;color:#fff;font:600 14px system-ui;cursor:pointer;box-shadow:0 8px 30px rgba(0,0,0,.35)'

  var frame = null
  button.addEventListener('click', function () {
    if (frame) {
      var hidden = frame.style.display === 'none'
      frame.style.display = hidden ? 'block' : 'none'
      button.textContent = hidden ? '✕ Close' : '💬 Ask us anything'
      return
    }
    frame = document.createElement('iframe')
    frame.src = origin + '/widget/' + encodeURIComponent(agent)
    frame.allow = 'microphone'
    frame.style.cssText =
      'position:fixed;bottom:76px;right:20px;z-index:99999;width:380px;height:540px;max-width:calc(100vw - 40px);' +
      'max-height:calc(100vh - 100px);border:1px solid #1f2937;border-radius:16px;background:#0d1117;' +
      'box-shadow:0 20px 60px rgba(0,0,0,.5)'
    document.body.appendChild(frame)
    button.textContent = '✕ Close'
  })

  document.body.appendChild(button)
})()
