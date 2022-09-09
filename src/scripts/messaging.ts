/**
 * This namespace is used for communication between the popup context and the background context
 * It listens for messages from the popup and does things that are not possible to do in popup
*/
namespace Messaging
{
	const TYP_SAVE_OPTIONS = 'save-options';
	const TYP_CLEAR_LIST = 'clear-list';
	const TYP_GET_DLG = 'get-bg';
	const TYP_DLGJSON = 'dlg-json';
	const TYP_DL_DIALOG_CLOSING = 'dl-gialog-closing';
	const TYP_DOWNLOAD = 'download';
	const TYP_DL_REPORTED = 'dl-reported';
	const TYP_GET_OPTS_DATA = 'get-options-data';
	const TYP_YTDL_MANIFEST = 'ytdl-manifest';
	const TYP_YTDL_VIDEO = 'ytdl-video';
	const TYP_YTDL_AUDIO = 'ytdl-audio';
	export const TYP_YTDL_PROGRESS = 'ytdl-progress';


	export interface Message
	{
		type: string;
	}
	
	export class MSGSaveOptions implements Message
	{
		type = TYP_SAVE_OPTIONS;
		constructor(public options: Options.DLGOptions){};
	}
	
	export class MSGClearlist implements Message
	{
		type = TYP_CLEAR_LIST;
	}
	
	export class MSGGetDLG implements Message
	{
		type = TYP_GET_DLG;
	}

	export class MSGDLGJSON implements Message
	{
		type = TYP_DLGJSON;
		constructor(public DLGJSON: DLGJSON){};
	}
	
	export class MSGDlDialogClosing implements Message
	{
		type = TYP_DL_DIALOG_CLOSING;
		constructor(public continueWithBrowser: boolean, 
			public dlHash: string, public windowId: number){};
	}
	
	export class MSGDownload
	{
		type = TYP_DOWNLOAD;
		constructor(public dlHash: string, public dmName: string){};
	}
	
	export class MSGYTDLManifest
	{
		type = TYP_YTDL_MANIFEST;
		constructor(public url: string, public dlHash: string, public formatId: string){};
	}

	export class MSGYTDLVideo
	{
		type = TYP_YTDL_VIDEO;
		constructor(public url: string, public filename: string, public dlHash: string,
			public formatId: string){};
	}

	export class MSGYTDLAudio
	{
		type = TYP_YTDL_AUDIO;
		constructor(public url: string, public filename: string, public dlHash: string){};
	}

	export class MSGYTDLProg
	{
		type = TYP_YTDL_PROGRESS;
		dlHash: string | undefined;
		tabId: number | undefined;
		
		constructor(public percent: string, specifier: number | string)
		{
			if(typeof specifier === 'string'){
				this.dlHash = specifier;
			}
			if(typeof specifier === 'number'){
				this.tabId = specifier;
			}
		};
	}


	export function startListeners()
	{
		browser.runtime.onMessage.addListener((msg: Message) => { 
			return doOnMessage(msg);
		});
	}

	/**
	 * Convenience function for sending a browser message
	 * @param msg
	 * @returns 
	 */
	export function sendMessage(msg: object): Promise<Message>
	{
		return browser.runtime.sendMessage(msg);
	}

	/* private stuff */

	/* listener */
	function doOnMessage(msg: Message): Promise<any>
	{
		//saves options
		if(msg.type === TYP_SAVE_OPTIONS)
		{
			handleSaveOptions(msg as MSGSaveOptions);
		}

		//clears the all downloads list
		else if(msg.type === TYP_CLEAR_LIST)
		{
			handleClearList(msg as MSGClearlist);
		}

		//gets a copy of DLG global variable
		else if(msg.type === TYP_GET_DLG)
		{
			return handleGetDLG(msg as MSGGetDLG);
		}

		//called when DLG download dialog is closing
		//used for cancelling a request we want to handle with download manager
		//also for closing blank tabs that were opened for the download
		else if(msg.type === TYP_DL_DIALOG_CLOSING)
		{
			handleDLDialog(msg as MSGDlDialogClosing);
		}

		//downloads a download with the specified DM
		else if(msg.type === TYP_DOWNLOAD)
		{
			handleDownload(msg as MSGDownload);
		}

		//downloads a stream manifest
		else if(msg.type === TYP_YTDL_MANIFEST)
		{
			handleYTDLManif(msg as MSGYTDLManifest)
		}

		//downloads a video url
		else if(msg.type === TYP_YTDL_VIDEO)
		{
			handleYTDLVid(msg as MSGYTDLVideo);
		}

		else if(msg.type === TYP_YTDL_AUDIO)
		{
			handleYTDLAud(msg as MSGYTDLAudio);
		}

		return Promise.resolve();

	}

	/* handlers */

	function handleSaveOptions(msg: MSGSaveOptions)
	{
		let saving = Options.save(msg.options);
		saving.then((error) => {
			if(error) log.err('saving options failed: ', error, msg.options);
			else log.d('options saved: ', msg.options);
		});
	}

	function handleClearList(msg: MSGClearlist)
	{
		DLG.allDownloads.clear();
	}

	function handleGetDLG(msg: MSGGetDLG): Promise<MSGDLGJSON>
	{
		return new Promise((resolve) => {
			let json: DLGJSON = {
				allDownloads: Utils.mapToArray(DLG.allDownloads),
				downloadDialogs: Utils.mapToArray(DLG.downloadDialogs),
				tabs: Utils.mapToArray(DLG.tabs),
				options: Options.opt,
				availableDMs: DLG.availableDMs,
			}
			resolve(new MSGDLGJSON((json)));
		});
	}

	//this message is received when download dialog is closing
	function handleDLDialog(msg: MSGDlDialogClosing)
	{
		DLG.downloadDialogs.delete(msg.windowId);
		let download = DLG.allDownloads.get(msg.dlHash)!;

		if(typeof download.resolveRequest === 'undefined'){
			log.err('download does not have resolve', download);
		}

		if(msg.continueWithBrowser){
			download.resolveRequest({cancel: false});
			return;
		}

		download.resolveRequest({cancel: true});

		//if this is a download that opens in an empty new tab and we are not 
		//continuing with browser then close the empty tab manually
		//todo: new tabs that are not blank do not get closed: https://jdownloader.org/download/index
		if(typeof download.tabId != 'undefined')
		{
			let dlTab = DLG.tabs.getsure(download.tabId);

			if(dlTab.url === "about:blank")
			{
				log.d('closing blank tab: ', dlTab);
				browser.tabs.remove(dlTab.id).catch((e) => {});
			}
		}

	}

	function handleDownload(msg: MSGDownload)
	{
		let download = DLG.allDownloads.get(msg.dlHash)!;
		DownloadJob.getFromDownload(msg.dmName, download).then((job)=>{
			DLG.doDownloadJob(job);
		});
	}

	function handleYTDLManif(msg: MSGYTDLManifest)
	{
		let download = DLG.allDownloads.get(msg.dlHash)!;
		let manifest = download.manifest!;
		let nmsg = new NativeMessaging.MSG_YTDLManifest(msg.url, manifest.title, msg.dlHash, msg.formatId);
		NativeMessaging.sendMessage(nmsg);
	}

	function handleYTDLVid(msg: MSGYTDLVideo)
	{
		let nmsg = new NativeMessaging.MSG_YTDLVideo(msg.url, msg.filename, msg.dlHash, msg.formatId);
		NativeMessaging.sendMessage(nmsg);
	}

	function handleYTDLAud(msg: MSGYTDLAudio)
	{
		let nmsg = new NativeMessaging.MSG_YTDLAudio(msg.url, msg.filename, msg.dlHash);
		NativeMessaging.sendMessage(nmsg);
	}

}