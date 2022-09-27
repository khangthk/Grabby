//todo: add ability to cancel stream download
//todo: show percent and download speed
class StreamHandler implements RequestHandler
{
	private download: Download;
	private filter: ReqFilter;
	private streamTab: tabinfo | undefined = undefined;

	constructor(download: Download, filter: ReqFilter)
	{
		this.download = download;
		this.filter = filter;
		//requests for formats that grabby sends do not have a tab id
		if(typeof download.tabId != 'undefined'){
			this.streamTab = GRB.tabs.getsure(download.tabId);
		}
	}

	handle()
	{
		this.download.isStream = true;
		this.download.hidden = true;

		this.receiveManifest().then(this.processManifest);

		//we must continue the request so the manifest data can be read in our receiveManifest function
		return Promise.resolve({cancel: false});
	}

	//reads the manifest text from the request
	private receiveManifest(): Promise<string>
	{
		return new Promise((resolve) => 
		{
			let f = browser.webRequest.filterResponseData(this.download.requestId);
			let decoder = new TextDecoder("utf-8");
			let response = "";
			
			f.ondata = (evt: any) => {
				response += decoder.decode(evt.data, {stream: true});
				f.write(evt.data);
			}	

			f.onstop = (evt: any) => {
				f.disconnect();
				resolve(response);
			}
		});
	}

	//parses the manifest text into an object
	private parseManifest(rawManifest: string): StreamManifest | undefined
	{
		let title = (this.download.tabTitle)? this.download.tabTitle : 'Unknown Title';

		if(title != 'Unknown Title')
		{
			let domain = Utils.getDomain(this.download.ownerTabUrl);
			title = Utils.removeSitenameFromTitle(title, domain);
		}

		let streamTitle = title;

		try
		{
			if(this.filter.isHlsManifest())
			{
				//@ts-ignore
				let parser = new m3u8Parser.Parser();
				parser.push(rawManifest);
				parser.end();
				let pManifest = parser.manifest as hlsRawManifest;
				return new StreamManifest(this.download.url, streamTitle, 'hls', pManifest);
			}
			else if(this.filter.isDashManifest())
			{
				//@ts-ignore
				let pManifest = mpdParser.parse(rawManifest, {manifestUri: this.download.url}) as dashRawManifest;
				return new StreamManifest(this.download.url, streamTitle, 'dash', pManifest);
			}
			else
			{
				log.warn("We got an unsupported manifest:", rawManifest);
				return undefined;
			}
		}
		catch(e)
		{
			log.warn("There was an error parsing the manifest:", rawManifest);
			return undefined;
		}
	}

	//takes the manifest text and creates a base manifest object from it and gives it to the 
	//corresponding handler
	private processManifest(manifText: string)
	{
		let manifest = this.parseManifest(manifText);
	
		if(typeof manifest === 'undefined'){
			log.err('could not parse manifest', manifText);
		}

		if(manifest.getType() === 'main')
		{
			if(typeof this.streamTab === 'undefined'){
				log.err('this main stream does not have a tab', this.download);
			}

			this.streamTab.hasMainManifest = true;

			if(manifest.streamFormat === 'hls') this.handleMainHLS(manifest);
			else if(manifest.streamFormat === 'dash') this.handleMainDASH(manifest);
		}
		else if(manifest.getType() === 'format')
		{
			if(manifest.streamFormat === 'hls')	this.handleFormatHLS(manifest);
			else if(manifest.streamFormat === 'dash') this.handleFormatDASH(manifest);
		}
	}

	private handleMainHLS(bManifest: StreamManifest)
	{
		log.d('we got a main HLS manifest: ', this.download.url, bManifest);

		let manifest = MainManifest.getFromBase(bManifest);

		this.download.manifest = manifest;

		GRB.addToAllDownloads(this.download);

		for(let format of manifest.formats)
		{
			//todo: change this to request ID because we are sending referer URL basically maybe some user doesn't want this
			let headers = {
				'X-GRB-MFSTHASH': this.download.hash,
				'X-GRB-MFSTID': format.id.toString()
			};
			fetch(format.url, {headers: headers});
		}
	}

	private handleFormatHLS(bManifest: StreamManifest)
	{
		log.d('we got a format HLS manifest: ', this.download.url, bManifest);

		let manifest = FormatManifest.getFromBase(bManifest);
		let hash = this.download.getHeader('X-GRB-MFSTHASH', 'request');
		let id = Number(this.download.getHeader('X-GRB-MFSTID', 'request'));

		//if it has a hash header it means it's a format we reqested
		if(hash)
		{
			let download = GRB.allDownloads.get(hash)!;

			if(!download.manifest){
				log.err('Download does not have a manifest', download);
			}

			download.fetchedFormats++;
			download.manifest.formats[id].update(manifest);

			if(download.fetchedFormats == download.manifest.formats.length)
			{
				log.d('got all manifests for: ', download);
				download.hidden = false;
				browser.pageAction.show(download.ownerTabId);
			}

			return;
		}

		if(typeof this.streamTab === 'undefined')
		{
			log.err('this format stream does not have a tab', this.download);
		}
		if(!this.streamTab.hasMainManifest)
		{
			this.handleSingleFormatHLS(bManifest, manifest);
		}
	}

	//for cases when the page only has a sub-manifest without a main manifest
	//example of this: https://videoshub.com/videos/25312764
	private handleSingleFormatHLS(bManifest: StreamManifest, fManifest: FormatManifest)
	{
		log.d('we got a single HLS manifest: ', this.download.url, bManifest);
		//we have to manually create a proper MainManifest for this download here
		let format = new ManifestFormatData(0, '', bManifest.url, 0, 0, 0, 0);
		format.update(fManifest);
		let formats = [format];
		let m = new MainManifest(bManifest.rawManifest, formats, bManifest.title);
		this.download.manifest = m;
		this.download.hidden = false;
		browser.pageAction.show(this.download.ownerTabId);
		GRB.addToAllDownloads(this.download);
	}

	private handleMainDASH(bManifest: StreamManifest)
	{
		log.warn('main DASH manifest not implemented');
	}

	private handleFormatDASH(bManifest: StreamManifest)
	{
		log.warn('format DASH manifest not implemented');
	}

}

