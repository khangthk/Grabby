namespace ContextMenu
{	
	export type result = 
	{
		links: page_link[],
		originPageUrl: string,
		originPageReferer: string
	};
	
	const MENU_ID_PARENT = 'grabby.menu.parent';
	const MENU_ID_GRAB_ALL = 'grabby.menu.graball';
	const MENU_ID_GRAB_SELECTION = 'grabby.menu.grabselection';
	const MENU_ID_GRAB_LINK = 'grabby.menu.grablink';
	const SCRIPT_GET_ALL = '/content_scripts/get_all_links.js';
	const SCRIPT_GET_SELECTION = '/content_scripts/get_selection_links.js';
	const SCRIPT_UTILS = '/scripts/utils.js';

	export function startListeners()
	{
		let menus = (GRB.browser.name === 'firefox')? browser.menus : chrome.contextMenus;

		//add grab all menu
		menus.create({
			id: MENU_ID_GRAB_ALL,
			title: "Grab All",
			contexts: ["page"],
		});

		//add grab selection menu
		menus.create({
			id: MENU_ID_GRAB_SELECTION,
			title: "Grab Selection",
			contexts: ["selection"],
		});

		//add grab link mneu
		menus.create({
			id: MENU_ID_GRAB_LINK,
			title: "Grab Link",
			contexts: ["link"],
		});

		//menu click listener
		menus.onClicked.addListener((info: any, tab: webx_tab) => {
			return doOnMenuClicked(info, tab, Options.opt.defaultDM);
		});
	}

	/**
	 * Runs every time a menu item is clicked
	 * Links in selection are extracted using code by: https://github.com/c-yan/open-selected-links
	 */
	async function doOnMenuClicked(info: any, tab: webx_tab, defaultDM: string)
	{
		log.d('menu clicked: ', info, '\ntab: ', tab);

		if(!defaultDM){
			Utils.notification("ERROR: No download managers found on the system");
			log.err('no download managers are available');
		}

		if(info.menuItemId == MENU_ID_GRAB_ALL){
			//if tab is undefined it means we are in forbidden urls where we can't inject scripts
			if(!tab){
				return;
			}
			let res = await Utils.executeScript(tab.id, {file: SCRIPT_GET_ALL}, [{file: SCRIPT_UTILS}]);
			downloadLinks(res);
		}
		else if(info.menuItemId == MENU_ID_GRAB_SELECTION){
			//if tab is undefined it means we are in forbidden urls where we can't inject scripts
			if(!tab){
				return;
			}
			let res = await Utils.executeScript(tab.id, {file: SCRIPT_GET_SELECTION}, [{file: SCRIPT_UTILS}]);
			downloadLinks(res);
		}
		else if(info.menuItemId == MENU_ID_GRAB_LINK)
		{
			let result: ContextMenu.result = 
			{
				links: [{href: info.linkUrl, text: info.linkText}],
				originPageUrl: '',
				originPageReferer: ''
			};

			if(tab){
				result.originPageUrl = info.pageUrl;
				result.originPageReferer = await Utils.executeScript(tab.id, {code: 'document.referrer'});
			}

			downloadLinks(result);
		}

		function downloadLinks(result: ContextMenu.result)
		{
			DownloadJob.getFromContext(defaultDM, result).then((job)=>{
				GRB.doDownloadJob(job);
			});
		}
	}
}