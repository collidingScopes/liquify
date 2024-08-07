/*
To do list:
dynamic cursor size based on brush size
Allow smudge to go right to the edge of the image
Format user menu and add other inputs
Can the brush also mix in other colors? i.e., a default color bias
Add default image (colorful ballons? colorful origami?)
Build floating GUI
Show image size, current brush size, other key metrics
Produce generative version which liquifies random parts of the canvas upon button click
Generative agent which move randomly and liquify as they move -- animated version
Add brush for restore, which draws the original picture on that spot
Add brush for add color, which adds a blob of colour on that spot, which can then be smudged
Better explain what smudge size does / rename? It brings more of the colour through / more hard / uses the brush size more faithfully
*/

var image,
MOUSE_UPDATE_DELAY = 30,
BRUSH_SIZE,
SMUDGE_SIZE, // SMUDGE_SIZE <= BRUSH_SIZE
LIQUIFY_CONTRAST,
timer,
canUpdate = true,
oldMouseX = 0,
oldMouseY = 0;

var canvas = document.getElementById("canvas");
var ctx = canvas.getContext("2d");
var canvasWidth;
var canvasHeight;

var animationRequest;
var playAnimationToggle = false;

var imageInput = document.getElementById('imageInput');
imageInput.addEventListener('change', readSourceImage);
var isImageLoaded = false;
var userImage;
var originalImg = document.getElementById('originalImg');

var actualWidth = 600; //size of default image
var actualHeight = 1000;
var scaledWidth = actualWidth;
var scaledHeight = actualHeight;
var widthScalingRatio = 1;
var maxImageWidth = 2000; //can be tweaked

var brushSizeInput = document.getElementById("brushSizeInput");
brushSizeInput.addEventListener("change",getUserInputs);

var smudgeSizeInput = document.getElementById("smudgeSizeInput");
smudgeSizeInput.addEventListener("change",getUserInputs);

var strengthInput = document.getElementById("strengthInput");
strengthInput.addEventListener("change",getUserInputs);

function getUserInputs(){
  BRUSH_SIZE = Number(brushSizeInput.value);
  SMUDGE_SIZE = Number(smudgeSizeInput.value);
  LIQUIFY_CONTRAST = Number(strengthInput.value/100);
  console.log("Brush size: "+BRUSH_SIZE);
  console.log("Smudge size: "+SMUDGE_SIZE);
  console.log("Strength: "+LIQUIFY_CONTRAST);
}

//detect user browser
var ua = navigator.userAgent;
var isSafari = false;
var isFirefox = false;
var isIOS = false;
var isAndroid = false;
if(ua.includes("Safari")){
    isSafari = true;
}
if(ua.includes("Firefox")){
    isFirefox = true;
}
if(ua.includes("iPhone") || ua.includes("iPad") || ua.includes("iPod")){
    isIOS = true;
}
if(ua.includes("Android")){
    isAndroid = true;
}
console.log("isSafari: "+isSafari+", isFirefox: "+isFirefox+", isIOS: "+isIOS+", isAndroid: "+isAndroid);

//save image button
var saveImageButton = document.getElementById("saveImageButton");
saveImageButton.addEventListener('click', saveImage);

//video recording function
var recordBtn = document.getElementById("recordVideoButton");
var recording = false;
var mediaRecorder;
var recordedChunks;
recordBtn.addEventListener('click', chooseRecordingFunction);
var finishedBlob;
var recordingMessageDiv = document.getElementById("videoRecordingMessageDiv");
var recordVideoState = false;
var videoRecordInterval;
var videoEncoder;
var muxer;
var mobileRecorder;
var videofps = 30;

//MAIN METHOD
userImage = document.getElementById("originalImg");
drawImageToCanvas();
build();

//read and accept user input image
function readSourceImage(){

  if(playAnimationToggle==true){
      playAnimationToggle = false;
      cancelAnimationFrame(animationRequest);
      console.log("cancel animation");
  } 
      
  //read image file      
  var file = imageInput.files[0];
  var reader = new FileReader();
  reader.onload = (event) => {
      var imageData = event.target.result;
      userImage = new Image();
      userImage.src = imageData;
      userImage.onload = () => {
        
          actualWidth = userImage.width;
          actualHeight = userImage.height;

          //image scaling
          if(actualWidth > maxImageWidth){
              scaledWidth = maxImageWidth;
              widthScalingRatio = scaledWidth / actualWidth;
              scaledHeight = actualHeight * widthScalingRatio;
          } else{
              scaledWidth = actualWidth;
              widthScalingRatio = 1;
              scaledHeight = actualHeight;
          }

          scaledWidth = Math.floor(scaledWidth/2)*2; //video encoder doesn't accept odd numbers
          scaledHeight = Math.floor(scaledHeight/8)*8; //video encoder wants a multiple of 8

          drawImageToCanvas();

          //show original image
          originalImg.src = canvas.toDataURL();
          originalImg.width = scaledWidth;
          originalImg.height = scaledHeight;

          console.log("Image width/height: "+scaledWidth+", "+scaledHeight);

          build();
          canvas.scrollIntoView({behavior:"smooth"});
          
      };
  };
    
  reader.readAsDataURL(file);
  isImageLoaded = true;

}

function drawImageToCanvas(){
  //resize the src variable of the original image
  canvasWidth = scaledWidth;
  canvasHeight = scaledHeight;
  canvas.width = canvasWidth;
  canvas.height = canvasHeight;
  
  //draw the resized image onto the page
  ctx.drawImage(userImage, 0, 0, scaledWidth, scaledHeight);
}

//  configurator / setup
function build() {
  canvas = canvas || document.getElementById('canvas');
  image = image || document.getElementById('originalImg');
  image.onload = resetCanvas;

  BRUSH_SIZE = Math.round(Math.min(canvasWidth,canvasHeight)*0.12);
  brushSizeInput.value = BRUSH_SIZE;
  brushSizeInput.min = Math.floor(Math.min(canvasWidth,canvasHeight)*0.02);
  brushSizeInput.max = Math.ceil(Math.min(canvasWidth,canvasHeight)*0.4);

  SMUDGE_SIZE = Math.round(BRUSH_SIZE*0.08);
  smudgeSizeInput.value = SMUDGE_SIZE;
  smudgeSizeInput.min = Math.floor(BRUSH_SIZE*0.02);
  smudgeSizeInput.max = Math.ceil(BRUSH_SIZE*0.2);

  getUserInputs();
}

function resetCanvas() {
  canvas.height = image.offsetHeight || canvas.height;
  canvas.width = image.offsetWidth || canvas.width;
  ctx.drawImage(image, 0, 0);
}

//  brush functions
function updateCoords(e) {
  var coord_x,
      coord_y;
  if(e.touches && e.touches.length == 1){ // Only deal with one finger
    var touch = e.touches[0]; // Get the information for finger #1
    coord_x = touch.pageX;
    coord_y = touch.pageY;
  } else {  // mouse
    coord_x = e.clientX;
    coord_y = e.clientY;
  }
  if (canUpdate) {
    var box = this.getBoundingClientRect(),
        cx = parseInt(coord_x - box.left),
        cy = parseInt(coord_y - box.top);
  
    
    // make sure we are within bounding box
    if (e.target.id == 'canvas') {
      liquify(cx, cy); 
    }
  
    canUpdate = false;
    
    timer = window.setTimeout(function() {
      canUpdate = true;
    }, MOUSE_UPDATE_DELAY);
  }
  
}

function applyContrast(o, n) {
  return ~~((1-LIQUIFY_CONTRAST) * o + LIQUIFY_CONTRAST * n);
}

// skew pixels based on the velocity of the mouse (dx, dy)    
function liquify(x, y) {
  // velocity
  var dx = x - oldMouseX,
      dy = y - oldMouseY;
      
  // for next time
  oldMouseX = x;
  oldMouseY = y;
  
  // build brush box around mouse pointer
  x = x - parseInt(BRUSH_SIZE/2);
  y = y - parseInt(BRUSH_SIZE/2);

  // check bounding with a defined brush dimension
  if (x < 0 ||
      y < 0 ||
      (x + BRUSH_SIZE) >= canvas.width ||
      (y + BRUSH_SIZE) >= canvas.height) {
        return;
      }
  
  var bitmap = ctx.getImageData(x, y, BRUSH_SIZE, BRUSH_SIZE);
  
  // note - each pixel is 4 bytes in byte array bitmap.data
  
  // bound dx, dy within brush size
  dx = (dx > 0) ? ~~Math.min(bitmap.width/2, dx) : ~~Math.max(-bitmap.width/2, dx);
  dy = (dy > 0) ? ~~Math.min(bitmap.height/2, dy) : ~~Math.max(-bitmap.height/2, dy);

  var buffer = ctx.createImageData(bitmap.width, bitmap.height),
      d = bitmap.data,
      _d = buffer.data,
      bit = 0;  // running bitmap index on buffer
      
    for(var row = 0; row < bitmap.height; row++) {
      for(var col = 0; col < bitmap.width; col++) {

        // distance from center gives intensity of smear
        var xd = bitmap.width/2 - col,
            yd = bitmap.height/2 - row,
            dist = Math.sqrt(xd*xd + yd*yd),
        
            x_liquify = (bitmap.width-dist)/bitmap.width,
            y_liquify = (bitmap.height-dist)/bitmap.height,
        
        // make intensity fall off exponentially
            power = 4.5,
            skewX = (dist > SMUDGE_SIZE/2) ? -dx * Math.pow(x_liquify,power) : -dx,
            skewY = (dist > SMUDGE_SIZE/2) ? -dy * Math.pow(y_liquify,power) : -dy;
        
            fromX = col + skewX,
            fromY = row + skewY;
        
        if (fromX < 0 || fromX > bitmap.width) {
          fromX = col;
        }
        
        if (fromY < 0 || fromY > bitmap.height) {
          fromY = row;
        }
        
        // origin bitmap index on bitmap
        var o_bit = ~~fromX * 4 +  ~~fromY * bitmap.width * 4;
        
        
        // exact copy equation - o_bit to bit:
        //o_bit = col *  4 +  row * bitmap.width * 4;
        
        // not quite sure why this occasionally is undefined
        if (d[o_bit] === undefined) {
          o_bit = bit;
        }
        
        _d[bit]     = applyContrast(d[bit], d[o_bit]);         // r
        _d[bit + 1] = applyContrast(d[bit + 1], d[o_bit + 1]); // g
        _d[bit + 2] = applyContrast(d[bit + 2], d[o_bit + 2]); // b
        _d[bit + 3] = applyContrast(d[bit + 3], d[o_bit + 3]); // a
            
        bit += 4;
      }
    }

  try {
    ctx.putImageData(buffer, x, y);  
  } catch(e) {
  }
  
}


//build();

// wire events...

// canvas & mouse
canvas.onmousedown = function(e) {
  canvas.onmousemove = updateCoords;
  window.clearTimeout(timer);
  canUpdate = true;
  return false; /* dont allow highlight cursor */
};

canvas.onmouseup = function() {
  canvas.onmousemove = null;
};

// touch
canvas.ontouchstart = function(e) {
  canvas.ontouchmove = updateCoords;
  window.clearTimeout(timer);
  canUpdate = true;
  return false;
};

canvas.ontouchend = function() {
  canvas.ontouchmove = null;
};    


document.getElementById('reset').onclick = resetCanvas;

function saveImage(){
  const link = document.createElement('a');
  link.href = canvas.toDataURL();

  const date = new Date();
  const filename = `liquify_${date.toLocaleDateString()}_${date.toLocaleTimeString()}.png`;
  link.download = filename;
  link.click();
}

function chooseRecordingFunction(){

}

function chooseEndRecordingFunction(){

}

