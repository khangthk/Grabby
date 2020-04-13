'use strict';

//todo: store options in sync, what's wrong with me?
//todo: save downloads list
//todo: policies:
/*
- Add-ons must only request those permissions that are necessary for function
- Add-ons should avoid including duplicate or unnecessary files
- Add-on code must be written in a way that is reviewable and understandable. 
Reviewers may ask you to refactor parts of the code if it is not reviewable.
- You may include third-party libraries in your extension. In that case, when you upload 
your extension to AMO, you will need to provide links to the library source code.
- The add-on listing should have an easy-to-read description about everything it does, 
and any information it collects. Please consult our best practices guide for creating
 an appealing listing.
 - If the add-on uses native messaging, the privacy policy must clearly disclose which 
information is being exchanged with the native application. Data exchanged with the 
native application must be in accordance with our No Surprises policy.
*/





/**
 * This is the main application class and holds all states
 * An instance of this is created in init.js as a global variable accessible
 * to anyonw who has access to 'background.js' scope
 */
class DlGrabApp {

	constructor(options) {
		this.options = options;
		// all requests made by Firefox are stored here temporarily until we get their response
		this.allRequests = new FixedSizeMap(100);
		// the last X downloadable items are stored here with their informations such as cookies,time,etc.
		this.allDownloads = new FixedSizeMap(options.dlListSize);
		// utility function
		this.runtime = {};
		this.runtime.idmAvailable = false;
	}

	/**
	 * this function returns a promise so that we can use 'await' on it
	 * it itself 'awaits' on sub-init functions and then resolves
	 */
	initialize() {

		var instance = this;
		return new Promise(async function (resolve) {
			console.log('initializing idm...');
			instance.runtime.idmAvailable = await initIDM();
			console.log('idm init finished');
			//resolve after all inits are completed
			resolve();
		});

		//this function returns a promise so that we can use 'await' on it
		function initIDM() {
			//todo: try without IDM addon being installed and see if it works
			return new Promise(function (resolve) {
				var initMessage = "MSG#2#6#2#2321:1:0:1294:704:-7:-7:1.25,117=37:Toolbox - Extension / Download Grab;";
				var port = browser.runtime.connectNative("com.tonec.idm");
				//this will only be called when IDM is available and reachable
				port.onMessage.addListener(function (m) {
					console.log('IDM is available');
					port.disconnect();
					resolve(true);
				});
				//this will only be called when the other end disconnects the connection
				//i.e. when IDM isn't available 
				port.onDisconnect.addListener((p) => {
					console.log("IDM is unavailable!");
					resolve(false);
				});
				console.log('sending idm init message...');
				port.postMessage(initMessage);
				//if IDM is available the onMessage() will disconnect port
				//if IDM is unavailable it will automatically disconnect port
				//but just for added safety we disconnect it in a timeout
				//if the promise is already resolved this will have no effect
				setTimeout(() => {
					port.disconnect();
					resolve(false);
				}, 500);
			});
		}

	}

	/**
	 * Adds a download to our main list of downloads
	 * @param {Download} download 
	 */
	addToAllDownloads(download){
		//we do this here because we don't want to run hash on requests we will not use
		let hash = md5(download.url);
		//we put hash of URL as key to prevent the same URL being added by different requests
		this.allDownloads.put(hash, download);
	}

}


class Download {

	/**
	 * Creates a new DlIem
	 * @param {object} details the 'details' object attached to a request
	 * @param {string} origin page from which it was reqested
	 * @param {array} reqHeaders 
	 * @param {array} resHeaders 
	 */
	constructor(details, origin, reqHeaders, resHeaders){
		this.requestId = details.requestId;
		this.url = details.url;
		this.time = details.timeStamp;
		this.resourceType = details.type;
		this.origin = origin;
		this.reqHeaders = reqHeaders;
		this.resHeaders = resHeaders;
	}

	/**
	 * gets a header associated with this reqeust
	 * @param {string} headerName name of the header
	 * @param {string} headerDirection either "request" or "response"
	 */
	getHeader(headerName, headerDirection){

		let headers;
		if(headerDirection === 'request'){
			headers = this.reqHeaders;
		}
		else{
			headers = this.resHeaders;
		}

		let headerItem =  headers.find(function(header){
			return header.name.toLowerCase() === headerName.toLowerCase();
		});

		if(headerItem){
			return headerItem.value;
		}
		else{
			return '';
		}

	}

	/**
	 * get file name (if available) of the resouce requested
	 * @returns file name or "unknown" if now available
	 */
	getFilename(){

		if(typeof this.filename === "undefined"){

			this.filename = "unknown";

			//todo: add support for filename*=

			let disposition = this.getHeader('content-disposition', 'response');
			if(disposition){
				const regex = /filename=["']?(.*?)["']?(;|$)/im;
				let matches = disposition.match(regex);
				if(matches && matches[1]){
					this.filename = matches[1];
				}

			}
			else{
				const regex = /\/([^\/\n\?\=]*)(\?|$)/;
				let matches = this.url.match(regex);
				if(matches && matches[1]){
					this.filename = matches[1];
				}
			}

		}

		return this.filename;
	}

	/**
	 * get content-length (if available) of the resource requested
	 * @returns size in MB or "unknown" if not available
	 */
	getSizeMB(){

		if(typeof this.sizeMB === "undefined"){

			this.sizeMB = "unknown";

			let contentLength = this.getHeader("content-length", "response");
			if (contentLength) {
				let fileSizeMB = (contentLength / 1048576).toFixed(1);
				this.sizeMB = fileSizeMB;
			}
		}

		return this.sizeMB;
	}

	/**
	 * gets the extension of the resource requested (if available)
	 * @returns the extension in lower case or "unknown" if no extension if available
	 */
	getFileExtension(){

		if(typeof this.fileExtension === "undefined"){

			this.fileExtension = "unknown";

			let filename = this.getFilename();
			let chuncks = filename.split('.');
			if(chuncks.length > 1){
				this.fileExtension = chuncks[chuncks.length-1].toLowerCase();
			}
		}

		return this.fileExtension;
	}

}


class ReqFilter {

	/**
	 * 
	 * @param {Download} download 
	 */
	constructor(download){
		this.download = download;
	}

	/* private funcitons */

	/**
	 * 
	 * @param {array} list 
	 */
	_isInProtocolList(list){
		for(let protocol of list){
			if(this.download.url.startsWith(protocol)){
				return true;
			}
		}
		return false;
	}

	/**
	 * 
	 * @param {array} list 
	 */
	_isInExtensionList(list){
		let extension = this.download.getFileExtension();
		if (extension !== "unknown" 
			&& list.includes(extension)) {
				return true;
		}
		return false;
	}

	/**
	 * 
	 * @param {array} list 
	 */
	_isInMimeList(list){
		let mime = this.download.getHeader("content-type", "response").toLowerCase();
		if (mime){
			for(let listMime of list){
				//we search for the mim'es occurence in the content-type because sometimes 
				//content-type has other things in it as well
				if(mime.indexOf(listMime) !== -1){
					return true;
				}
			}
		}
		return false;
	}

	/**
	 * 
	 * @param {array} list list of webRequest.ResourceTypes 
	 */
	_isInTypeList(list){
		return list.includes(this.download.resourceType) && app.options.excludeWebFiles;
	}

	
	/* public functions */

	isProtocoLBlackListed(){
		return this._isInProtocolList(app.options.protocolBlackList);
	}

	isSizeBlackListed(){
		let size = this.download.getSizeMB();
		return size !== 'unknown' && size < app.options.grabFilesLargerThanMB;
	}

	isExtensionBlackListed(){
		return this._isInExtensionList(app.options.extensionBlackList);
	}

	isMimeBlackListed(){
		return this._isInMimeList(app.options.mimeBlackList);
	}

	isTypeBlackListed(){
		return this._isInTypeList(app.options.typeBlackList);
	}

	isExtensionWhiteListed(){
		return this._isInExtensionList(app.options.extensionWhiteList);
	}

	isMimeWhiteListed(){
		return this._isInMimeList(app.options.mimeWhiteList);
	}

	isTypeWhiteListed(){
		return this._isInTypeList(app.options.typeWhiteList);
	}

	/**
	 * does this request have an "attachment" header?
	 */
	hasAttachment(){
		let disposition = this.download.getHeader('content-disposition', 'response').toLowerCase();
		return ( disposition && disposition.indexOf("attachment") !== -1 );
	}

	/**
	 * should we cancel the request and show Download Grab's download dialog?
	 */
	doesOverride(){
		return this.hasAttachment();
	}

}


/**
 * A fixed sized map with key->value pairs
 * When size gets bigger than the limit, first element is deleted 
 * and the new element is put in
 * Duplicate elements will rewrite the old ones
 */
class FixedSizeMap {

	/**
	 * 
	 * @param {int} size 
	 * @param {object} listData (optional) the data to initialize this FixedSizeMap with
	 */
	constructor(size, listData) {
		size = (Number(size));
		this.limit = isNaN(size) ? 100 : size;
		this.list = (listData) ? this._trimListData(listData, size) : {};
	}

	getKeys() {
		return Object.keys(this.list);
	};

	getValues() {
		return Object.values(this.list);
	};

	getSize() {
		return this.getKeys().length;
	};

	remove(key) {
		delete this.list[key];
	};

	put(key, value) {
		if (this.getSize() === this.limit) {
			let firstItemKey = this.getKeys()[0];
			this.remove(firstItemKey);
		}
		this.list[key] = value;
	};

	get(key) {
		return this.list[key];
	};

	_trimListData(listData, targetSize) {
		let keys = Object.keys(listData);
		let size = keys.length;
		if (targetSize < size) {
			let diff = size - targetSize;
			for (i = 0; i < diff; i++) {
				let k = keys[i];
				delete listData[k];
			}
		}
		return listData;
	}
	
}