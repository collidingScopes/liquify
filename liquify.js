/*
To do list:
dynamic cursor size based on brush size
Add brush for restore, which draws the original picture on that spot
For generative background:
Allow user to choose "null colour" which get dragged from outside the canvas edge. Right now it appears as transparent in the png
Make the GUI dynamic (show/hide "Select Image" button in the GUI, etc.)
Organize GUI into folders? (brush options, marker options, etc...)
On mobile, screen can become unscrollable (can't save or change options)
Test the lock canvas feature on mobile (can user scroll the page after?)
On mobile, screen touch position can become unsynced from the canvas
Allow color palettes for the Mondrian grid painting
Allow to set default angle of the perlin noise field (and direction of draw/increment)
Add toggle for generative movement option (random, flow field, circular swirls) -- allow the agent to choose randomly
Add website about section / link div
Mode where you can animate upon manual mouseclick (triggers animation draw with user input)
- For example, can make it look like a car tyre is spinning
Radius should scale based on brush size
Experiment with multiple marker agents at the same time (need to make each agent an object?)
Try some videos played in reverse (reconstructing the original image)
Mobile video export is broken (firefox working, mobile not?)
Animation is very slow on Firefox
Try a smoke animation on a natural looking / nearly blank canvas -- focus on smoke swirls
randomYMovement (sine booster) is too strong on mobile -- needs to be scaled based on w/h
*/

var image,
MOUSE_UPDATE_DELAY = 30,
BRUSH_SIZE,
SMUDGE_SIZE,
LIQUIFY_CONTRAST,
timer,
canUpdate = true,
oldMouseX = 0,
oldMouseY = 0;

var markerToggle = true;
var markerColor;


var canvas = document.getElementById("canvas");
var ctx = canvas.getContext("2d", {
  willReadFrequently: true,
});
var canvasWidth;
var canvasHeight;

var maxCanvasWidth = 2000;
var maxCanvasHeight = 2000;

var animationSpeed;
var animationRequest;
var playAnimationToggle = false;

//image input variables
var imageInput = document.getElementById('imageInput');
imageInput.addEventListener('change', readSourceImage);
var isImageLoaded = false;
var userImage = document.getElementById('userImg');

var actualWidth = 600; //size of default image
var actualHeight = 1000;
var scaledWidth = actualWidth;
var scaledHeight = actualHeight;
var widthScalingRatio = 1;
var maxImageWidth = 1080; //can be tweaked
var canvasLockToggle = false;
var backgroundColor;

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
  startingCanvas: 'GradGrid',
  brushSize: Math.min(150, window.innerWidth*0.18),
  brushDensity: 5,
  opacity: 100,
  animationSpeed: 10,
  marker: true,
  markerColor: "#ffffff",
  solidColor: "#000000",
  canvasWidth: Math.min(maxCanvasWidth, window.innerWidth*0.95),
  canvasHeight: Math.min(maxCanvasHeight, window.innerHeight*0.95),
};
var backgroundType = obj.startingCanvas;

var gui = new dat.gui.GUI( { autoPlace: false } );
gui.close();
var guiOpenToggle = false;

// Choose from accepted values
gui.add(obj, 'startingCanvas', [ 'Mondrian', 'Gradient', 'ColorGrid', 'Solid Color', 'GradGrid', 'Image' ] ).name('Starting Canvas').listen().onChange(chooseBackground);
gui.addColor(obj, "solidColor").name("Solid Color").onFinishChange(chooseBackground);

obj['selectImage'] = function () {
  imageInput.click();
};
gui.add(obj, 'selectImage').name('Select Image');

gui.add(obj, "brushSize").min(10).max(500).step(1).name('Brush Size').listen().onChange(getUserInputs);
gui.add(obj, "brushDensity").min(1).max(100).step(1).name('Brush Density').listen().onChange(getUserInputs);
gui.add(obj, "opacity").min(5).max(100).step(1).name('Brush Opacity').listen().onChange(getUserInputs);
gui.add(obj, "animationSpeed").min(1).max(50).step(1).name('Animation Speed').onChange(getUserInputs);
gui.add(obj, "marker").name("Marker Dot (m)").listen().onChange(toggleMarkerDraw);
gui.addColor(obj, "markerColor").name("Marker Color").onFinishChange(getUserInputs);

obj['refreshCanvas'] = function () {
  resetCanvas();
};
gui.add(obj, 'refreshCanvas').name("Refresh Canvas (r)");

obj['saveImage'] = function () {
saveImage();
};
gui.add(obj, 'saveImage').name("Image Export (i)");

obj['saveVideo'] = function () {
  toggleVideoRecord();
};
gui.add(obj, 'saveVideo').name("Start/Stop Video Export (v)");

obj['animate'] = function () {
  pausePlayAnimation();
};
gui.add(obj, 'animate').name("Play Randomized Animation (p)");

obj['lock'] = function () {
  lockUnlockCanvas();
};
gui.add(obj, 'lock').name("Lock/Unlock Canvas (l)");

gui.add(obj, "canvasWidth").max(maxCanvasWidth).name("Canvas Width").onChange(chooseBackground);
gui.add(obj, "canvasHeight").max(maxCanvasHeight).name("Canvas Height").onChange(chooseBackground);

customContainer = document.getElementById( 'gui' );
customContainer.appendChild(gui.domElement);

function getUserInputs(){
  BRUSH_SIZE = obj.brushSize;
  SMUDGE_SIZE = obj.brushDensity/100 * BRUSH_SIZE;
  LIQUIFY_CONTRAST = obj.opacity/100;
  markerColor = obj.markerColor;
  backgroundColor = obj.solidColor;
  animationSpeed = 500 / obj.animationSpeed;
  //console.log("Brush size: "+BRUSH_SIZE);
  //console.log("Smudge size: "+SMUDGE_SIZE);
  //console.log("Opacity: "+LIQUIFY_CONTRAST);
  //console.log("background color: "+backgroundColor);
}

function chooseBackground(){

  getUserInputs();

  if(playAnimationToggle==true){
    playAnimationToggle = false;
    cancelAnimationFrame(animationRequest);
    console.log("cancel animation");
  }//cancel any existing animation loops 

  backgroundType = obj.startingCanvas;
  console.log("background type: "+backgroundType);

  canvasWidth = obj.canvasWidth;
  canvasHeight = obj.canvasHeight;
  canvas.width = canvasWidth;
  canvas.height = canvasHeight;

  generatePerlinData();

  if(backgroundType == "ColorGrid"){

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

    drawMondrian();

  } else if(backgroundType == "Gradient"){

    generateGradientBackground();

  } else if(backgroundType == "Image"){
    drawImageToCanvas();
    //userImage = document.getElementById("originalImg");
    //image = image || document.getElementById('originalImg');
    //userImage.onload = resetCanvas;
  } else if(backgroundType == "Solid Color"){
    ctx.fillStyle = backgroundColor;
    ctx.fillRect(0,0,canvasWidth,canvasHeight);

  } else if(backgroundType == "GradGrid"){

    ctx.fillStyle = "black";
    ctx.fillRect(0,0,canvasWidth,canvasHeight);

    var numRows = Math.max(1,Math.ceil(Math.random()*10));
    var cellHeight = Math.ceil(canvasHeight / numRows);

    var saturation = randomWithinRange(0.5,0.3);
    var lightness = randomWithinRange(0.55,0.2);
    var saturationRange = 0.2;
    var masterHue = Math.random()*360;
    var masterColor = "hsl("+masterHue+","+saturation*100+"%,"+lightness*100+"%)";
    var direction;

    if(Math.random()<0.5){
      direction = -1;
    } else {
      direction = 1;
    }
    var hueRange = Math.random()*15;
    var hueStep = Math.random()*15;

    var colorArray = [];
    var hueArray = [];

    for(var row=0; row<numRows; row++){

      var numCols = Math.max(1,Math.ceil(Math.random()*10));
      var cellWidth = Math.ceil(canvasWidth / numCols);
      colorArray[row] = [];
      hueArray[row] = [];

      for(var col=0; col<numCols; col++){

        var x0 = col*cellWidth;
        var x1 = x0+cellWidth;
        var y0 = row*cellHeight;
        var y1 = y0;
        var currentGradient = ctx.createLinearGradient(x0,y0,x1,y1);

        var hue1;
        var color1;
        
        var hue2;
        var color2;

        if(col==0){
          //hue1 = masterHue + hueStep*row*direction;
          hue1 = randomWithinRange(masterHue,hueStep);
          color1 = "hsl("+hue1+","+(randomWithinRange(saturation,saturationRange))*100+"%,"+(randomWithinRange(lightness,saturationRange))*100+"%)";
        } else {
          hue1 = hueArray[row][col-1];
          color1 = colorArray[row][col-1];
        }
        
        if(Math.random()>0.05){
          hue2 = randomWithinRange(hue1,hueRange);
          color2 = "hsl("+hue2+","+(randomWithinRange(saturation,saturationRange))*100+"%,"+(randomWithinRange(lightness,saturationRange))*100+"%)";
        } else {
          if(Math.random()<0.5){
            color2 = "#0f083e";
            hue2 = getHueFromHex(color2);
          }
        }

        hueArray[row].push(hue2);
        colorArray[row].push(color2);

        //add color stops
        currentGradient.addColorStop(Math.random()*0.5,color1);
        currentGradient.addColorStop(Math.random()*0.5+0.5,color2);
        ctx.fillStyle = currentGradient;

        if(Math.random()<0.0){
          ctx.fillRect(cellWidth*col,cellHeight*row,cellWidth,cellHeight);
        }

        //draw random noise on the canvas after
        var noiseLevel = cellWidth*cellHeight * 0.5;
        var power = Math.max(5,Math.random()*100);

        for(var i=0; i<noiseLevel; i++){
          var x = cellWidth*col + Math.floor(Math.pow(Math.random(),power)*cellWidth);
          var y = cellHeight*row + Math.floor(Math.pow(Math.random(),1)*cellHeight);

          var rand = Math.random();
          if(col==0){
            ctx.fillStyle = color2;
          } else {
            ctx.fillStyle = colorArray[row][col-1];
          }
          /*
          if(rand<0.45){
            ctx.fillStyle = color1;
          } else if(rand < 0.9) {
            ctx.fillStyle = color2;
          } else {
            ctx.fillStyle = "white";
          }
          */
          ctx.fillRect(x,y,1,1);
        }
        
      }

    }

  }

  //update canvas size text box
  var canvasSizeTextBox = document.getElementById("canvasSizeTextBox");
  canvasSizeTextBox.innerHTML = Math.round(canvasWidth)+" x "+Math.round(canvasHeight);

}

//  brush functions
function updateCoords(e) {

  //don't liquify if the canvas is locked
  if(canvasLockToggle == true){
    return;
  }

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

  var cx;
  var cy;
  var x;
  var y;
  var direction;
  var counter = 0;
  var angle = 0;
  var maxRadius = Math.min(canvasWidth,canvasHeight) * 0.1;
  var minRadius = (canvasWidth+canvasHeight)/2 * 0.6;
  var radiusRange = maxRadius - minRadius;
  var radius;

  var movementFactor; //should make this user controlled
  var maxXMovement;
  var maxYMovement;

  var movementBoost = 3;
  var angleBias = Math.random()-0.5;

  randomizeStartPoint();

  function randomizeStartPoint(){
    cx = Math.floor(Math.random()*canvasWidth);
    cy = Math.floor(Math.random()*canvasHeight);

    if(cx < canvasWidth/2){
      direction = 1;
    } else {
      direction = -1;
    }
  }

  function loop(){

    //Circular swirl movement, with center x/y based on perlin noise
    movementFactor = 0.05/animationSpeed;
    maxXMovement = canvasWidth*movementFactor;
    angle = (angle + (Math.PI/360)/2000) % (Math.PI*2);
    radius = minRadius + radiusRange * (Math.sin(counter/animationSpeed)+1)/2;

    var perlinGridX = Math.floor((cx/canvasWidth) * numPerlinCols);
    var perlinGridY = Math.floor((cy/canvasHeight) * numPerlinRows);
    var currentSlope = perlinDataArray[perlinGridY*numPerlinCols+perlinGridX] + angleBias;

    var xMovement = maxXMovement*direction;
    var yMovement = xMovement * currentSlope * movementBoost;
    var randomYMovement = Math.sin(counter/animationSpeed) * 2 * Math.min(canvasWidth,canvasHeight)/1500;

    cx = cx+xMovement;
    cy = cy+yMovement + randomYMovement;

    //randomize X/Y values if they will go off canvas
    if(cx < 0 || cx > canvasWidth){
      randomizeStartPoint();
    }
    if(cy < 0 || cy > canvasHeight){
      randomizeStartPoint();
    }

    x = cx + radius*Math.cos(angle);
    y = cy + radius*Math.sin(angle);

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
      /*
      setTimeout(function(){
        liquify(x,y);
        animationRequest = requestAnimationFrame(loop);
      },MOUSE_UPDATE_DELAY);
      */
      angle++;
      counter++;
      liquify(x,y);

      //draw color where the marker is
      if(markerToggle){
        ctx.beginPath();
        ctx.fillStyle = markerColor;
        ctx.globalAlpha = 0.5;
        ctx.arc(cx,cy,Math.ceil(Math.min(canvasWidth,canvasHeight)*0.01),0,Math.random()*Math.PI*2);
        ctx.fill();
        ctx.closePath();
        ctx.globalAlpha = 1;
      }

      animationRequest = requestAnimationFrame(loop);
      

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
          console.log("Image width/height: "+scaledWidth+", "+scaledHeight);

          drawImageToCanvas();
          chooseBackground();
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
  
  //draw the resized image onto the canvas
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

function tweakHexColor(hexColor, range){
  var rgbArray = hexToRGB(hexColor);

  var newRGBArray = [];

  newRGBArray.push(Math.floor(rgbArray[0]+range*Math.random()-range/2));
  newRGBArray.push(Math.floor(rgbArray[1]+range*Math.random()-range/2));
  newRGBArray.push(Math.floor(rgbArray[2]+range*Math.random()-range/2));

  var newHexColor = rgbToHex(newRGBArray[0],newRGBArray[1],newRGBArray[2]);
  return newHexColor;
}

function getHueFromHex(hex) {
  const rgb = hexToRgb(hex);
  const r = rgb.r / 255;
  const g = rgb.g / 255;
  const b = rgb.b / 255;

  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const delta = max - min;

  let hue = 0;

  if (delta === 0) {
    hue = 0;
  } else if (max === r) {
    hue = (g - b) / delta;
  } else if (max === g) {
    hue = 2 + (b - r) / delta;
  } else {
    hue = 4 + (r - g) / delta;
  }

  hue *= 60;
  if (hue < 0) {
    hue += 360;
  }

  return hue;
}

function hexToRgb(hex) {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result ? {
      r: parseInt(result[1], 16),
      g: parseInt(result[2], 16),
      b: parseInt(result[3], 16)
  } : null;
}

function rgbToHue(r, g, b) {
  const rNorm = r / 255;
  const gNorm = g / 255;
  const bNorm = b / 255;
  const hue = Math.atan2(Math.sqrt(3) * (gNorm - bNorm), 2 * rNorm - gNorm - bNorm);
  return hue * 180 / Math.PI;
}

function rgbToSaturation(r, g, b) {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  return (max - min) / max;
}

function rgbToLightness(r, g, b) {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  return (max + min) / 2 / 255;
}

function interpolateHex(hex1,hex2,factor){
  hex1RGB = hexToRgb(hex1);
  hex2RGB = hexToRgb(hex2);

  var newR = Math.round(hex1RGB.r + (hex2RGB.r - hex1RGB.r)*factor);
  var newG = Math.round(hex1RGB.g + (hex2RGB.g - hex1RGB.g)*factor);
  var newB = Math.round(hex1RGB.b + (hex2RGB.b - hex1RGB.b)*factor);

  var rgbResult = "rgb("+newR+","+newG+","+newB+")";
  return rgbResult;
}

function rgbToHex(r, g, b) {
  return "#" + (
    (r.toString(16).padStart(2, "0")) +
    (g.toString(16).padStart(2, "0")) +
    (b.toString(16).padStart(2, "0"))
  );
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
      toggleVideoRecord();
  } else if (event.key === 'o') {
      toggleGUI();
  } else if(event.key === 'p'){
      pausePlayAnimation();
  } else if(event.key === 'm'){
      toggleMarkerDraw();
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

const GRID_SIZE = 3;
const RESOLUTION = 128;
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

      }
  }

}

//use perlin noise to create a smooth gradient background
function generateGradientBackground(){

  var gradientDataArray;
  const GRID_SIZE = 1;
  const RESOLUTION = 32;

  perlin.seed(); //reset perlin data
  gradientDataArray = [];

  var baseHue = 180 + Math.random()*180; //bound between 180-360 (exclude green/yellow)
  var hueRange = 300;
  var saturation = 0.6 + Math.random()*0.4;
  var lightness = 0.4 + Math.random()*0.35;
  console.log("base hue / saturation / lightness: "+baseHue+", "+saturation+", "+lightness);

  var pixelWidth = Math.ceil(canvasWidth / RESOLUTION);
  var pixelHeight = Math.ceil(canvasHeight / RESOLUTION);
  let num_pixels = GRID_SIZE / RESOLUTION;
  
  for (let y = 0; y < GRID_SIZE; y += num_pixels / GRID_SIZE){
      for (let x = 0; x < GRID_SIZE; x += num_pixels / GRID_SIZE){
          let currentPerlinValue = perlin.get(x, y);
          gradientDataArray.push(currentPerlinValue);

          if(backgroundType == "Gradient"){
            //draw heatmap onto the canvas using perlin data
            var currentHue = parseInt(currentPerlinValue * hueRange/2 + baseHue);
            ctx.fillStyle = 'hsl('+currentHue+','+saturation*100+'%'+','+lightness*100+'%)';
            ctx.fillRect(
                Math.floor(x / GRID_SIZE * canvasWidth),
                Math.floor(y / GRID_SIZE * canvasHeight),
                pixelWidth,
                pixelHeight,
            );

          }
      }
  }
               
}

function toggleVideoRecord(){
  if(recordVideoState == false){
    recordVideoState = true;
    chooseRecordingFunction();
  } else {
    recordVideoState = false;
    chooseEndRecordingFunction();
  }
}

function chooseRecordingFunction(){
  if(isIOS || isAndroid || isFirefox){
      startMobileRecording();
  }else {
      recordVideoMuxer();
  }
}

function chooseEndRecordingFunction(){
  if(isIOS || isAndroid || isFirefox){
      mobileRecorder.stop();
  }else {
      finalizeVideo();
  }
}

//record html canvas element and export as mp4 video
//source: https://devtails.xyz/adam/how-to-save-html-canvas-to-mp4-using-web-codecs-api
async function recordVideoMuxer() {
  console.log("start muxer video recording");
  var videoWidth = Math.floor(canvas.width/2)*2;
  var videoHeight = Math.floor(canvas.height/8)*8; //force a number which is divisible by 8
  console.log("Video dimensions: "+videoWidth+", "+videoHeight);

  //display user message
  //recordingMessageCountdown(videoDuration);
  recordingMessageDiv.classList.remove("hidden");

  recordVideoState = true;
  const ctx = canvas.getContext("2d", {
    // This forces the use of a software (instead of hardware accelerated) 2D canvas
    // This isn't necessary, but produces quicker results
    willReadFrequently: true,
    // Desynchronizes the canvas paint cycle from the event loop
    // Should be less necessary with OffscreenCanvas, but with a real canvas you will want this
    desynchronized: true,
  });

  muxer = new Mp4Muxer.Muxer({
    target: new Mp4Muxer.ArrayBufferTarget(),
  //let muxer = new Muxer({
      //target: new ArrayBufferTarget(),
      video: {
          // If you change this, make sure to change the VideoEncoder codec as well
          codec: "avc",
          width: videoWidth,
          height: videoHeight,
      },

      firstTimestampBehavior: 'offset', 

    // mp4-muxer docs claim you should always use this with ArrayBufferTarget
    fastStart: "in-memory",
  });

  videoEncoder = new VideoEncoder({
    output: (chunk, meta) => muxer.addVideoChunk(chunk, meta),
    error: (e) => console.error(e),
  });

  // This codec should work in most browsers
  // See https://dmnsgn.github.io/media-codecs for list of codecs and see if your browser supports
  videoEncoder.configure({
    codec: "avc1.42003e",
    width: videoWidth,
    height: videoHeight,
    bitrate: 4_000_000,
    bitrateMode: "constant",
  });
  //NEW codec: "avc1.42003e",
  //ORIGINAL codec: "avc1.42001f",

  var frameNumber = 0;
  //setTimeout(finalizeVideo,1000*videoDuration+200); //finish and export video after x seconds

  //take a snapshot of the canvas every x miliseconds and encode to video
  videoRecordInterval = setInterval(
      function(){
          if(recordVideoState == true){
              renderCanvasToVideoFrameAndEncode({
                  canvas,
                  videoEncoder,
                  frameNumber,
                  videofps
              })
              frameNumber++;
          }else{
          }
      } , 1000/videofps);

}

//finish and export video
async function finalizeVideo(){
  console.log("finalize muxer video");
  clearInterval(videoRecordInterval);
  recordVideoState = false;
  // Forces all pending encodes to complete
  await videoEncoder.flush();
  muxer.finalize();
  let buffer = muxer.target.buffer;
  finishedBlob = new Blob([buffer]); 
  downloadBlob(new Blob([buffer]));

  //hide user message
  recordingMessageDiv.classList.add("hidden");
  
}

async function renderCanvasToVideoFrameAndEncode({
  canvas,
  videoEncoder,
  frameNumber,
  videofps,
}) {
  let frame = new VideoFrame(canvas, {
      // Equally spaces frames out depending on frames per second
      timestamp: (frameNumber * 1e6) / videofps,
  });

  // The encode() method of the VideoEncoder interface asynchronously encodes a VideoFrame
  videoEncoder.encode(frame);

  // The close() method of the VideoFrame interface clears all states and releases the reference to the media resource.
  frame.close();
}

function downloadBlob() {
  console.log("download video");
  let url = window.URL.createObjectURL(finishedBlob);
  let a = document.createElement("a");
  a.style.display = "none";
  a.href = url;
  const date = new Date();
  const filename = `liquify_${date.toLocaleDateString()}_${date.toLocaleTimeString()}.mp4`;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  window.URL.revokeObjectURL(url);
}

//record and download videos on mobile devices
function startMobileRecording(){
  var stream = canvas.captureStream(videofps);
  mobileRecorder = new MediaRecorder(stream, { 'type': 'video/mp4' });
  mobileRecorder.addEventListener('dataavailable', finalizeMobileVideo);

  console.log("start simple video recording");
  console.log("Video dimensions: "+canvas.width+", "+canvas.height);

  //display user message
  //recordingMessageCountdown(videoDuration);
  recordingMessageDiv.classList.remove("hidden");
  
  recordVideoState = true;
  mobileRecorder.start(); //start mobile video recording

  /*
  setTimeout(function() {
      recorder.stop();
  }, 1000*videoDuration+200);
  */
}

function finalizeMobileVideo(e) {
  setTimeout(function(){
      console.log("finish simple video recording");
      recordVideoState = false;
      /*
      mobileRecorder.stop();*/
      var videoData = [ e.data ];
      finishedBlob = new Blob(videoData, { 'type': 'video/mp4' });
      downloadBlob(finishedBlob);
      
      //hide user message
      recordingMessageDiv.classList.add("hidden");

  },500);

}

function lockUnlockCanvas(){
  canvasLockToggle = !canvasLockToggle;
  console.log("Canvas lock state: "+canvasLockToggle);
}

function toggleMarkerDraw(){
  if(markerToggle){
    markerToggle = false;
    obj["marker"] = false;
  } else {
    markerToggle = true;
    obj["marker"] = true;
  }
}

function randomWithinRange(value,range){
  return value-range+Math.random()*range*2;
}


//MAIN METHOD
getUserInputs();
chooseBackground();

