import { useWebGL, updateUseWebGL, pauseWebGL, setIsMobile } from "./main";
import { setAnimateCallBack } from "./main";
import { renderFinished } from "./main";

let renderStartTime = new Date().getTime();
let renderEndTime = renderStartTime;

setIsMobile(/Mobi|Android/i.test(navigator.userAgent));

setAnimateCallBack((pathTracer, action) => {
    const pauseWebGLCheckbox = document.getElementById('pause-sampling') as HTMLInputElement;
    if(action === 'update') {
        pauseWebGLCheckbox.checked = renderFinished;
        document.getElementById('debug-samples')!.textContent = `${pathTracer.samples.toFixed(0)}`;
        document.getElementById('debug-cost-time')!.textContent = `${(renderEndTime - renderStartTime) > 0 ? ((renderEndTime - renderStartTime) / 1000).toFixed(2) : 0}s`;
    }
    if(action === 'start') {
        pauseWebGLCheckbox.checked = renderFinished;
        renderStartTime = new Date().getTime();
    }
    if(action === 'render') {
        renderEndTime = new Date().getTime();
    }
    if(action === 'end') {
        renderEndTime = new Date().getTime();
    }
});

window.onload = () => {
    const useWebGLCheckbox = document.getElementById('use-webgl') as HTMLInputElement;
    const pauseWebGLCheckbox = document.getElementById('pause-sampling') as HTMLInputElement;
    useWebGLCheckbox.checked = useWebGL;
    pauseWebGLCheckbox.parentElement!.style.display = useWebGL ? 'block' : 'none';
    useWebGLCheckbox.addEventListener('change', () => {
        if (useWebGLCheckbox.checked) {
            updateUseWebGL(true);
            pauseWebGLCheckbox.parentElement!.style.display = 'block';
        } else {
            updateUseWebGL(false);
            pauseWebGLCheckbox.parentElement!.style.display = 'none';
        }
    });
    pauseWebGLCheckbox.checked = false;
    pauseWebGLCheckbox.addEventListener('change', () => {
        if (pauseWebGLCheckbox.checked) {
            pauseWebGL();
        } else {
            pauseWebGL();
        }
    });
};