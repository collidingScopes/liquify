/*
To do list:
dynamic cursor size based on brush size
Can the brush also mix in other colors? i.e., a default color bias
Show image size, current brush size, other key metrics
Produce generative version which liquifies random parts of the canvas upon button click
- Generative agent which move randomly and liquify as they move -- animated version
Add brush for restore, which draws the original picture on that spot
Add brush for add color, which adds a blob of colour on that spot, which can then be smudged
On mobile, screen can become unscrollable (can't save or change options)
On mobile, screen touch position can become unsynced from the canvas
For generative background:
Better color choices -- based on HSL scale instead? Start with palette then allow random
Allow custom canvas size
Allow user to choose "null colour" which get dragged from outside the canvas edge. Right now it appears as transparent in the png
Allow user to adjust exponentially power (hard square vs. smooth circle)
Hide "Select Image" button in the GUI when ColorGrid is chosen
In GUI, add button to turn off the brush/mousedown effect, so that mobile users can scroll / resize
Add button to start/stop the generative animation in the GUI
Option to make generative agent move based on a flow field
Allow color palettes for the Mondrian grid painting
Allow to set default angle of the perlin noise field (and direction of draw/increment)
Video export functionality (toggle on/off?)
Experiment with different parameters on the flow field that might look better
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

//image input variables
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

function getUserInputs(){
  BRUSH_SIZE = obj.brushSize;
  SMUDGE_SIZE = obj.brushDensity/100 * BRUSH_SIZE;
  LIQUIFY_CONTRAST = obj.opacity/100;
  console.log("Brush size: "+BRUSH_SIZE);
  console.log("Smudge size: "+SMUDGE_SIZE);
  console.log("Opacity: "+LIQUIFY_CONTRAST);
}

function chooseBackground(){
  backgroundType = obj.StartingCanvas;
  console.log("background type: "+backgroundType);

  if(backgroundType == "ColorGrid"){
    canvasWidth = window.innerWidth*0.95;
    canvasHeight = window.innerHeight*0.95;
    canvas.width = canvasWidth;
    canvas.height = canvasHeight;

    var rows = 8;
    var cols = 8;
    var cellHeight = Math.ceil(canvasHeight / rows);
    var cellWidth = Math.ceil(canvasWidth / cols);
    var baseColor = rgbToHex(Math.round(Math.random()*255),Math.round(Math.random()*255),Math.round(Math.random()*255));
    var backgroundColorRange = 150;

    //draw grid of colors
    for(var i=0; i<rows; i++){
      for(var j=0; j<cols; j++){
        var x = j*cellWidth;
        var y = i*cellHeight;

        ctx.fillStyle = tweakHexColor(baseColor,backgroundColorRange);
        ctx.fillRect(x,y,cellWidth,cellHeight)

      }
    }

  } else if(backgroundType == "Mondrian"){
    canvasWidth = window.innerWidth*0.95;
    canvasHeight = window.innerHeight*0.95;
    canvas.width = canvasWidth;
    canvas.height = canvasHeight;
    generatePerlinData();
    drawMondrian();

  } else {
    userImage = document.getElementById("originalImg");
    drawImageToCanvas();
  }

  build();

}

//  configurator / setup
function build() {
  canvas = canvas || document.getElementById('canvas');
  
  if(backgroundType == "Image"){
    image = image || document.getElementById('originalImg');
    image.onload = resetCanvas;
  }

  /*
  Reset default brush settings
  BRUSH_SIZE = Math.round(Math.min(canvasWidth,canvasHeight)*0.12);
  obj.brushSize = BRUSH_SIZE;
  obj.brushSize.min = Math.floor(Math.min(canvasWidth,canvasHeight)*0.02);
  obj.brushSize.max = Math.ceil(Math.min(canvasWidth,canvasHeight)*0.4);

  obj.brushDensity = 8;
  SMUDGE_SIZE = Math.round(BRUSH_SIZE*0.08);
  */

  getUserInputs();
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
/*
var saveImageButton = document.getElementById("saveImageButton");
saveImageButton.addEventListener('click', saveImage);
*/

//video recording function
/*
var recordBtn = document.getElementById("recordVideoButton");
recordBtn.addEventListener('click', chooseRecordingFunction);
*/

var recording = false;
var mediaRecorder;
var recordedChunks;
var finishedBlob;
var recordingMessageDiv = document.getElementById("videoRecordingMessageDiv");
var recordVideoState = false;
var videoRecordInterval;
var videoEncoder;
var muxer;
var mobileRecorder;
var videofps = 30;

//add gui
var obj = {
  StartingCanvas: 'Mondrian',
  brushSize: Math.min(500, window.innerWidth*0.15),
  brushDensity: 5,
  opacity: 100,
};
var backgroundType = obj.StartingCanvas;

var gui = new dat.gui.GUI( { autoPlace: false } );
gui.close();
var guiOpenToggle = false;

// Choose from accepted values
gui.add(obj, 'StartingCanvas', [ 'Mondrian', 'ColorGrid', 'Image' ] ).name('Starting Canvas').listen().onChange(chooseBackground);

obj['SelectImage'] = function () {
  imageInput.click();
};
gui.add(obj, 'SelectImage').name('Select Image');

gui.add(obj, "brushSize").min(10).max(500).step(1).name('Brush Size').listen().onChange(getUserInputs);
gui.add(obj, "brushDensity").min(1).max(100).step(1).name('Brush Density').listen().onChange(getUserInputs);
gui.add(obj, "opacity").min(5).max(100).step(1).name('Opacity').listen().onChange(getUserInputs);

obj['RefreshCanvas'] = function () {
  resetCanvas();
};
gui.add(obj, 'RefreshCanvas').name("Refresh Canvas (r)");

obj['SaveImage'] = function () {
saveImage();
};
gui.add(obj, 'SaveImage').name("Save Image (i)");

obj['SaveVideo'] = function () {
  chooseRecordingFunction();
};
gui.add(obj, 'SaveVideo').name("Save Video (v)");

customContainer = document.getElementById( 'gui' );
customContainer.appendChild(gui.domElement);

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
  

  //IF FUNCTION WAS MOVED BEFORE BUILDING BRUSH BOX AND MODIFIED
  // check bounding with a defined brush dimension
  if (x < 0 ||
      y < 0 ||
      (x) > canvas.width ||
      (y) > canvas.height) {
        return;
      }
  
  // build brush box around mouse pointer
  x = x - parseInt(BRUSH_SIZE/2);
  y = y - parseInt(BRUSH_SIZE/2);

  /*
  ORIGINAL BOUNDING EXIT FUNCTION
  // check bounding with a defined brush dimension
  if (x < 0 ||
    y < 0 ||
    (x + BRUSH_SIZE) >= canvas.width ||
    (y + BRUSH_SIZE) >= canvas.height) {
      return;
    }
  */
  
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
            power = 6,
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

//Generative animation
//animation at randomized x/y points

function startGenerativeDraw(){

  console.log("start generative draw animation");

  if(playAnimationToggle==true){
    playAnimationToggle = false;
    cancelAnimationFrame(animationRequest);
    console.log("cancel animation");
  }//cancel any existing animation loops 
  playAnimationToggle = true;

  var x;
  var y;
  var direction;

  var movementFactor = 0.02; //should make this user controlled
  var maxXMovement = canvasWidth*movementFactor;
  var maxYMovement = canvasHeight*movementFactor;
  
  var angleBias = Math.random()-0.5;

  randomizeStartPoint();

  function randomizeStartPoint(){
    x = Math.floor(Math.random()*canvasWidth);
    y = Math.floor(Math.random()*canvasHeight);

    if(Math.random()<0.5){
      direction = -1;
    } else {
      direction = 1;
    }
  }

  function loop(){

    //Movement based on perlin noise
    movementFactor = 0.08;

    var movementBoost = 2;
    var perlinGridX = Math.floor((x/canvasWidth) * numPerlinCols);
    var perlinGridY = Math.floor((y/canvasHeight) * numPerlinRows);
    var currentSlope = perlinDataArray[perlinGridY*numPerlinCols+perlinGridX] + angleBias;

    var xMovement = maxXMovement*direction;
    var yMovement = xMovement * currentSlope * movementBoost;

    x = x+xMovement;
    y = y+yMovement;

    //randomize X/Y values if they will go off canvas
    if(x < 0 || x > canvasWidth){
      randomizeStartPoint();
    }
    if(y < 0 || y > canvasHeight){
      randomizeStartPoint();
    }

    /*
    //RANDOM X and Y movement
    movementFactor = 0.1;
    
    if(Math.random()<0.5){
      direction = -1;
    } else {
      direction = 1;
    }

    var xMovement = Math.round(Math.random() * maxXMovement - maxXMovement/2) * direction;
    var yMovement = Math.round(Math.random() * maxYMovement - maxYMovement/2) * direction;

    if(x+xMovement < 0 || x+xMovement > canvasWidth){
      x = x - xMovement;
    } else {
      x = x + xMovement;
    }

    if(y+yMovement < 0 || y+yMovement > canvasHeight){
      y = y - yMovement;
    } else {
      y = y + yMovement;
    }
    */

    if(playAnimationToggle==true){
      setTimeout(function(){
        liquify(x,y);
        animationRequest = requestAnimationFrame(loop);
      },MOUSE_UPDATE_DELAY);
    }

  }
  animationRequest = requestAnimationFrame(loop);
}

//HELPER FUNCTIONS BELOW

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

function resetCanvas() {
  if(playAnimationToggle==true){
    playAnimationToggle = false;
    cancelAnimationFrame(animationRequest);
    console.log("cancel animation");
  } 
  chooseBackground();
}

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

function hexToRGB(hexColor){
  
  var rgbArray = []

  const r = parseInt(hexColor.substring(1, 3), 16);
  const g = parseInt(hexColor.substring(3, 5), 16);
  const b = parseInt(hexColor.substring(5, 7), 16);
  
  rgbArray.push(r);
  rgbArray.push(g);
  rgbArray.push(b);

  return rgbArray;
}

function rgbToHex(r, g, b) {
  return "#" + (
    (r.toString(16).padStart(2, "0")) +
    (g.toString(16).padStart(2, "0")) +
    (b.toString(16).padStart(2, "0"))
  );
}

function tweakHexColor(hexColor, range){
  var rgbArray = hexToRGB(hexColor);

  var newRGBArray = [];

  newRGBArray.push(Math.floor(rgbArray[0]+range*Math.random()-range/2));
  newRGBArray.push(Math.floor(rgbArray[1]+range*Math.random()-range/2));
  newRGBArray.push(Math.floor(rgbArray[2]+range*Math.random()-range/2));

  var newHexColor = rgbToHex(newRGBArray[0],newRGBArray[1],newRGBArray[2]);
  return newHexColor;
}

function toggleGUI(){
  if(guiOpenToggle == false){
      gui.open();
      guiOpenToggle = true;
  } else {
      gui.close();
      guiOpenToggle = false;
  }
}

//shortcut hotkey presses
document.addEventListener('keydown', function(event) {
  if (event.key === 'r') {
      resetCanvas();
  } else if (event.key === 'i') {
      saveImage();
  } else if (event.key === 'v') {
      chooseRecordingFunction();
  } else if (event.key === 'o') {
      toggleGUI();
  } else if(event.key === 'p'){
      pausePlayAnimation();
  }
});

// Mondrian object and functions

var mondrianPalette = ["black","white","red","blue","yellow"];

function randInt (min, max) {
  return Math.floor(Math.random() * (max - min) + min)
}

class Point {
  constructor (x, y) {
      this.x = x
      this.y = y
  }
}

class Rectangle {
  constructor (min, max) {
      this.min = min
      this.max = max
  }

  get width () {
      return this.max.x - this.min.x
  }

  get height () {
      return this.max.y - this.min.y
  }

  draw (ctx) {
      // Draw clockwise
      ctx.moveTo(this.min.x, this.min.y)
      ctx.lineTo(this.max.x, this.min.y)
      ctx.lineTo(this.max.x, this.max.y)
      ctx.lineTo(this.min.x, this.max.y)
      ctx.lineTo(this.min.x, this.min.y)
  }

  split (xPad, yPad, depth, limit, ctx) {
      ctx.fillStyle = mondrianPalette[randInt(0, mondrianPalette.length)]
      ctx.fillRect(this.min.x, this.min.y, this.max.x, this.max.y)
      this.draw(ctx)

      // Check the level of recursion
      if (depth === limit) {
      return
      }

      // Check the rectangle is enough large and tall
      if (this.width < 2 * xPad || this.height < 2 * yPad) {
      return
      }

      // If the rectangle is wider than it's height do a left/right split
      var r1 = new Rectangle()
      var r2 = new Rectangle()
      if (this.width > this.height) {
      var x = randInt(this.min.x + xPad, this.max.x - xPad)
      r1 = new Rectangle(this.min, new Point(x, this.max.y))
      r2 = new Rectangle(new Point(x, this.min.y), this.max)
      // Else do a top/bottom split
      } else {
      var y = randInt(this.min.y + yPad, this.max.y - yPad)
      r1 = new Rectangle(this.min, new Point(this.max.x, y))
      r2 = new Rectangle(new Point(this.min.x, y), this.max)
      }

      // Split the sub-rectangles
      r1.split(xPad, yPad, depth + 1, limit, ctx)
      r2.split(xPad, yPad, depth + 1, limit, ctx)
  }
}

function drawMondrian(){
  //draw Mondrian grid
  ctx.beginPath();
  ctx.lineWidth = 5;

  var xPad = Math.floor(canvasWidth * 0.05);
  var yPad = Math.floor(canvasHeight * 0.05);

  var initialRect = new Rectangle(new Point(0, 0), new Point(canvasWidth, canvasHeight));
  initialRect.split(xPad, yPad, 0, 8, ctx);

  ctx.stroke();
}

function pausePlayAnimation(){
  console.log("pause/play animation");
  if(playAnimationToggle==true){
      playAnimationToggle = false;
      cancelAnimationFrame(animationRequest);
      console.log("cancel animation");
  } else {
      startGenerativeDraw();
  }
}

//Perlin noise functions
//SOURCE: https://github.com/joeiddon/perlin

var perlinDataArray;
const GRID_SIZE = 4;
const RESOLUTION = 128;
const COLOR_SCALE = 250;
var numPerlinRows = GRID_SIZE*RESOLUTION;
var numPerlinCols = GRID_SIZE*RESOLUTION;

function generatePerlinData(){
  
  perlin.seed(); //reset perlin data
  perlinDataArray = [];

  let pixel_size = canvasWidth / RESOLUTION;
  let num_pixels = GRID_SIZE / RESOLUTION;
  
  for (let y = 0; y < GRID_SIZE; y += num_pixels / GRID_SIZE){
      for (let x = 0; x < GRID_SIZE; x += num_pixels / GRID_SIZE){
          let currentPerlinValue = perlin.get(x, y);
          perlinDataArray.push(currentPerlinValue);

          /*
          //draw heatmap onto the canvas using perlin data
          let v = parseInt(currentPerlinValue * COLOR_SCALE);
          ctx.fillStyle = 'hsl('+v+',50%,50%)';
          ctx.fillRect(
              x / GRID_SIZE * canvasWidth,
              y / GRID_SIZE * canvasWidth,
              pixel_size,
              pixel_size
          );
          */
      }
  }

  console.log(perlinDataArray);
}


//MAIN METHOD
chooseBackground();
//setTimeout(startGenerativeDraw,2000);

