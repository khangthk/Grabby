document.addEventListener("DOMContentLoaded", (event) => {

	ui.getAll(".action").each(function(){
		this.addEventListener('click', ()=>{
			actionClicked(DLGPop.selectedDl, this);
		});
	});

	//download progress is sent to background via the native app, and then 
	//sent here using messaging
	browser.runtime.onMessage.addListener((msg) => { 
		if(msg.type === Messaging.TYP_YTDL_PROGRESS)
		{
			let percent = msg.percent;
			let dlHash = msg.dlHash;
			let el = ui.get(`#downloads-list li[data-hash="${dlHash}"]`);

			//remove the progress bar when download is complete
			if(percent == '100')
			{
				el.style = '';
			}
			else{
				el.style.background = `linear-gradient(to right, #8c8fb1 ${percent}%, #fff 0%)`;
			}
		}
	});

	ui.get("#dl-with-dlgrab").click();

	getBackgroundData().then(onBgDataRcvd);

});

/**
 * This is called every time something with '.action' class is clicked in a popup dialog
 * @param {Download} selectedDl 
 * @param {Element} clickedAction 
 */
function actionClicked(selectedDl, clickedAction)
{
	let id = clickedAction.id;
	let disabled = clickedAction.getAttribute("class").indexOf("disabled-action") !== -1;

	if(disabled){
		return;
	}

	switch(id){
		
		case "action-download":
			if(ui.get("#dl-with-dlgrab").checked){
				downloadWithSelectedDM(selectedDl);
			}
			else{
				downloadWithFirefox(selectedDl);
			}
			break;

		case "action-ytdl-video":
			downloadWithYtdl(selectedDl, clickedAction.getAttribute('data-format-id'), 'video');
			break;

		case "action-ytdl-audio":
			downloadWithYtdl(selectedDl, clickedAction.getAttribute('data-format-id'), 'audio');
			break;

		case "action-back":
			showDownloadsList();
			break;

		case "action-clearList":
			clearDownloadsList();
			break;

		case "dl-with-dlgrab":
			ui.get("#dm-list-container").classList.remove("disabled");
			break;

		case "dl-with-firefox":
			ui.get("#dm-list-container").classList.add("disabled");
			break;			

		case "action-report":
			let source = (window.location.href.indexOf("popup.html") !== -1)? "popup dialog" : "download dialog";
			reportDownload(selectedDl, source);
			break;

		default:
			break;
	}
}

/**
 * This is called when background data (DLG) is received via messaging
 */
function onBgDataRcvd()
{ 
	showDownloadsList();
}

/**
 * shows the list of all download items
 */
function showDownloadsList()
{
	ui.hide('.unique-display');

	//this is called two different times
	//1- when we click the popup button
	//2- when we click back from a download details panel
	//when we click back the downloads are already there and only hidden
	//so we don't have to repopulate them in this case

	if(ui.get('#popup-main').getAttribute('populated')){
		ui.show('#popup-main');
		return;
	}

	//populate list of downloads
	let keys = DLGPop.allDownloads.getKeys();
	//reverse to show latest downloads on top
	keys.reverse();
	
	for(const key of keys){

		/**
		 * @type {Download}
		 */
		let download = DLGPop.allDownloads.get(key);

		if(download.hidden){
			continue;
		}

		if(DLGPop.options.showOnlyTabDls && download.tabId != DLGPop.currTabId){
			continue;
		}

		let listItem = ui.create('li', {
			'id': "req_" + download.requestId,
			'class': "dl-item " + download.debug_gray,
			'title': download.url,
			'data-hash': key
		});
		let reason = (log.DEBUG)? " (" + download.classReason + ")" : "";

		listItem.innerHTML = download.getFilename() + reason;

		listItem.addEventListener("click", function(evt)
		{
			//todo: when you click a download and make some changes and then click another download 
			// the same changes are still there because it's the same page
			ui.get('#action-report').setAttribute('class', 'action');
			ui.get('#action-report').innerHTML = 'Report falsely detected download';

			let hash = this.getAttribute("data-hash");
			DLGPop.selectedDl = DLGPop.allDownloads.get(hash);
			log('item clicked: ', DLGPop.selectedDl);

			if(DLGPop.selectedDl.isStream){
				showStreamDetails(DLGPop.selectedDl);
			}
			else{
				showDownloadDetails(DLGPop.selectedDl);
			}
		});

		//this is for getting the info we put in tests
		if(log.DEBUG){
			listItem.addEventListener("contextmenu", function(evt){
				evt.preventDefault();
				let hash = this.getAttribute("data-hash");
				let dl = DLGPop.allDownloads.get(hash);
				let info = {};
				info.reqDetails = dl.reqDetails;
				info.resDetails = dl.resDetails;
				log(JSON.stringify(info).replace(/\\/g, '\\\\').replace(/'/g, "\\'"));
			});
		}

		ui.get("#downloads-list").appendChild(listItem);
	}

	ui.get('#popup-main').setAttribute('populated', 'populated');
	ui.show('#popup-main');
}

/**
 * Shows the details popup for a particular download item
 * @param {Download} download 
 */
function showDownloadDetails(download)
{
	ui.hide('.unique-display');

	ui.get("#download-details #filename").innerHTML = download.getFilename();
	ui.get("#download-details #filename").setAttribute("title", download.getFilename());
	ui.get("#download-details #size").innerHTML = 
		(download.getSize() !== "unknown")? filesize(download.getSize()) : download.getSize();
	ui.get("#download-details #url").innerHTML = download.url;
	ui.get("#download-details #url").setAttribute("title", download.url);

	populateDMs();

	ui.show('#download-details');
}

/**
 * Shows the details popup for a particular stream download
 * @param {Download} download 
 */
function showStreamDetails(download)
{
	ui.hide('.unique-display');

	let manifest = download.manifest;

	ui.get("#stream-details #formats-list").innerHTML = "";

	let duration = Utils.formatSeconds(manifest.playlists[0].duration);
	ui.get("#stream-details #filename").innerHTML = manifest.title;
	ui.get("#stream-details #filename").setAttribute("title", manifest.title);
	ui.get("#stream-details #duration").innerHTML = duration;
	ui.get("#stream-details #duration").setAttribute("title", duration);

	//sort
	manifest.playlists.sort((a, b)=>{
		return a.pictureSize - b.pictureSize;
	});

	for(let format of manifest.playlists)
	{
		let li = document.createElement('li');
		li.setAttribute('class', 'format action');
		li.setAttribute('id', 'action-ytdl-video');
		li.setAttribute('data-format-id', format.id);
		document.querySelector("#stream-details #formats-list").appendChild(li);

		let name = format.name;
		let res = format.res;
		let size = filesize(parseInt(format.fileSize), {round: 0});

		li.innerHTML = `${name} [ ${res}px / ~${size} ]`;
	}

	//add the listeners for the newly added elements
	document.querySelectorAll("#stream-details .action").forEach(function(action){
		action.addEventListener('click', (evt)=>{
			actionClicked(DLGPop.selectedDl, action);
		});
	});

	ui.show('#stream-details');
}

/**
 * clears list of all download items
 */
function clearDownloadsList()
{
	ui.get("#downloads-list").innerHTML = '<li id="no-dl" style="display:none;">No Downloads</li>';
	let message = {type: Messaging.TYP_CLEAR_LIST};
	Messaging.sendMessage(message);
}