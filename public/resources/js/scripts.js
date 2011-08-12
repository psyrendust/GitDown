var gitDown_currentFile; // The current file in the editor.
var gitDown_stream; // A FileStream object, used to read and write files.
var gitDown_defaultDir; // The default directory location.
var gitDown_chooserMode; // Whether the FileChooser.html window is used as an Open or Save As window.
var gitDown_string;
var foo;

/**
 * Initializes the UI.
 */
function gitDown_init() {
	gitDown_defaultDir = air.File.userDirectory;
	$('#gitDown_selectMarkdownBtn').click(function(){
		gitDown_openFileDB();
	});
	$('#gitDown_refreshBtn').css('opacity', '0.5').unbind('click');
	$(window).bind('focus', function(){
		gitDown_refresh();
	});
	gitDown_loadHelp();
}

/**
 * Refreshes the current file.
 */

function gitDown_refresh() {
	if(!gitDown_stream) return;
	gitDown_stream = new air.FileStream();
	try 
	{
		gitDown_stream.open(gitDown_currentFile, air.FileMode.READ);
		gitDown_string = gitDown_stream.readUTFBytes(gitDown_stream.bytesAvailable);
		gitDown_stream.close();
		$("#gitDown_main").empty().append(markdown(gitDown_string));
		document.title = "GitDown - " + gitDown_currentFile.name + " - updated: " + gitDown_getCurrentTime();
	} 
	catch(error) 
	{
		gitDown_ioErrorHandler(error);
	}
}

/**
 * Displays the FileChooser.html file in a new window, and sets its mode to "Open".
 */
function gitDown_openFileDB() {
	var gitDown_fileChooser;
	if(gitDown_currentFile)
	{
		gitDown_fileChooser = gitDown_currentFile;
	}
	else
	{
		gitDown_fileChooser = gitDown_defaultDir;
	}
	gitDown_fileChooser.browseForOpen("Open");
	gitDown_fileChooser.addEventListener(air.Event.SELECT, gitDown_openFile);
}

/**
 * Opens and reads a file. 
 */
function gitDown_openFile(event) {
	gitDown_stream = new air.FileStream();
	try 
	{
		gitDown_currentFile = event.target;
		gitDown_stream.open(gitDown_currentFile, air.FileMode.READ);
		var str = gitDown_stream.readUTFBytes(gitDown_stream.bytesAvailable);
		gitDown_stream.close();
		$("#gitDown_main").empty().append(markdown(str));
		document.title = "GitDown - " + gitDown_currentFile.name + " - updated: " + gitDown_getCurrentTime();
		$('#gitDown_refreshBtn').css('opacity', '1').click(function(){
			gitDown_refresh();
		});
	} 
	catch(error) 
	{
		gitDown_ioErrorHandler(error);
	}
	event.target.removeEventListener(air.Event.SELECT, gitDown_openFile); 
	
}

/**
 * Displays the "Save As" dialog box.
 */
function gitDown_saveAs() {
	var gitDown_fileChooser;
	if(gitDown_currentFile)
	{
		gitDown_fileChooser = gitDown_currentFile;
	}
	else
	{
		gitDown_fileChooser = gitDown_defaultDir;
	}
	gitDown_fileChooser.browseForSave("Save");
	gitDown_fileChooser.addEventListener(air.Event.SELECT, gitDown_saveAsSelectHandler);
}	
function gitDown_saveAsSelectHandler(event) {
	gitDown_currentFile = event.target;
	event.target.removeEventListener(air.Event.SELECT, gitDown_saveAsSelectHandler);
	gitDown_saveFile();
}

/**
 * Opens and saves a file with the data in the mainText textArea element. 
 * Newline (\n) characters in the text are replaced with the 
 * platform-specific line ending character (File.lineEnding), which is the 
 * line-feed character on Mac OS and the carriage return character followed by the 
 * line-feed character on Windows.
 */
function gitDown_saveFile() {
	if (gitDown_currentFile == null) 
	{
		gitDown_saveAs();
	} 
	else 
	{
		try 
		{
			gitDown_stream = new air.FileStream();
			gitDown_stream.open(gitDown_currentFile, air.FileMode.WRITE);
			// var outData = document.getElementById("mainText").value;
			// outData = outData.replace(/\n/g, air.File.lineEnding);
			var outData = markdown(gitDown_string);
			gitDown_stream.writeUTFBytes(outData);
			gitDown_stream.close();
			//document.title = "Text Editor - " + currentFile.name;
		} 
		catch(error) 
		{
			gitDown_ioErrorHandler(error);
		}
	}
}		

/**
 * Error message for file I/O errors. 
 */
function gitDown_ioErrorHandler(error) {
	// alert("Error reading or writing the file.", error);
}
function gitDown_openBrowser(_url) {
	var _urlReq = new air.URLRequest(_url); 
	air.navigateToURL(_urlReq);
}
function gitDown_openCheatSheet() {
	var initOptions = new air.NativeWindowInitOptions();
	initOptions.maximizable = false;
	initOptions.resizable = false;
	var screenWidth = 826;
	var screenHeight = 565;
	var bounds = new air.Rectangle(Math.round((screen.width-screenWidth)/2), Math.round((screen.height-screenHeight)/2), screenWidth, screenHeight);
	var html2 = air.HTMLLoader.createRootWindow(true, initOptions, false, bounds);
	var urlReq2 = new air.URLRequest("resources/cheatSheet.html");
	html2.load(urlReq2);
	html2.stage.nativeWindow.activate();
}
function gitDown_getCurrentTime(){
	var date = new Date();
	var hours = date.getHours();
	var mins = date.getMinutes();
	var secs = date.getSeconds();
	var time = "am";
	if(hours == 0){
		hours = 12;
		time = "AM";
	}else if(hours > 11){
		hours = hours - 12;
		time = "PM";
	}
	if(mins < 10){
		mins = "0" + mins;
	}
	if(secs < 10){
		secs = "0" + secs;
	}
	return hours + ":" + mins + ":" + secs + " " + time;
}
function gitDown_loadHelp(){
	$('#gitDown_main').load('resources/help.txt');
}
$(function(){
	gitDown_init();
});