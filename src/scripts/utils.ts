namespace Utils
{
	/**
	 * Gets domain name of a url
	 * @param url 
	 */
	export function getDomain(url: string)
	{
		let a = document.createElement('a');
		a.href = url;
		return a.hostname;
	}

	/**
	 * Gets path part of a url
	 * @param url 
	 */
	export function getPath(url: string)
	{
		let a = document.createElement('a');
		a.href = url;
		return a.pathname;
	}
	
	/**
	 * Gets a "clean" URL, i.e. a URL without query string and fragments, etc.
	 * @param url 
	 */
	export function getFullPath(url: string)
	{
		let a = document.createElement('a');
		a.href = url;
		return (a.protocol + '//' + a.hostname + a.pathname);
	}

	export function getFileName(url: string)
	{
		let path = Utils.getPath(url);
		path = decodeURI(path);
		if(path.slice(-1) === '/'){
			path = path.slice(0, -1);
		}
		let filename = path.split('/').pop();
		return (filename)? filename : '';
	}

	export function getExtFromFileName(filename: string)
	{
		let chuncks = filename.split('.');
		let ext = '';
		if(chuncks.length > 1){
			ext = chuncks[chuncks.length-1].toLowerCase();
		}
		return ext;
	}

	/**
	 * Gets cookies associated with the given URL
	 * @param url 
	 */
	export async function getCookies(url: string){
		let cookies = '';
		let cookiesArr = await browser.cookies.getAll({url: url});
		for(let cookie of cookiesArr){
			cookies += `${cookie.name}=${cookie.value}; `;
		}
		return cookies;
	}

	/**
	 * Performs an executeScript on a tab
	 * @param tabId 
	 * @param details 
	 */
	export async function executeScript(tabId: number, details: webx_execScriptDetails, 
		preqs?: webx_execScriptDetails[]): Promise<any | undefined>
	{
		try
		{
			//inject the prerequisites
			if(preqs && preqs.length)
			{
				for(let i=0; i<preqs.length; i++)
				{
					await browser.tabs.executeScript(tabId, preqs[i]);
				}
			}
			//inject the script
			let res = await browser.tabs.executeScript(tabId, details);
			if(res.length === 0) return undefined;
			if(res.length === 1) return (res[0] != 'undefined')? res[0] : '';
			return res;
		}
		catch(e)
		{
			log.err('Error executing script: ', e);
		}
	}

	/**
	 * Formats time in seconds into proper time format like hh:mm:ss
	 * @param seconds number of seconds
	 * @returns 
	 */
	export function formatSeconds(seconds: number)
	{
		var date = new Date(0);
		date.setSeconds(seconds);
		if(seconds >= 60 * 60)
		{
			return date.toISOString().substr(11, 8);
		}
		else
		{
			return date.toISOString().substr(14, 5);
		}
	}

	export function notification(title: string, msg: string)
	{
		let options = {
			type: "basic", 
			title: title, 
			iconUrl: "icons/icon128.png",
			message: msg,
		};
		browser.notifications.create(options);
	}

	export function showPageAction(tabId: number)
	{
		//if(GB.browser.name === 'firefox')
		//{
			try{
				browser.pageAction.show(tabId);
			}catch(e){};
		//}
	}

	export function hidePageAction(tabId: number)
	{
		//if(GB.browser.name === 'firefox')
		//{
			try{
				browser.pageAction.hide(tabId);
			}catch(e){};
		//}
	}

	export async function getCurrentTab()
	{
		let tabs = await browser.tabs.query({currentWindow: true, active: true});
		return tabs[0];
	}

	export function mapToArray<K, V>(map: Map<K, V>): [key: K, value: V][]
	{
		let arr: [key: K, value: V][] = [];

		let keys = map.keys();
		for(let key of keys)
		{
			let pair: [key: K, value: V] = [key, map.get(key)!];
			arr.push(pair);
		}

		return arr;
	}

	export function removeSitenameFromTitle(title: string, domain: string): string
	{
		let siteNames = [
			domain,
			domain.replace('www', ''),
			domain.substring(0, domain.lastIndexOf('.'))
		];

		let regStrings = [
			'(.*)\\s*\\|\\s*{{host}}', 
			'(.*)\\s*-\\s*{{host}}', 
			'{{host}}\\s*\\|\\s*(.*)', 
			'{{host}}\\s*-\\s*(.*)'
		];

		for(let regStr of regStrings)
		{
			for(let siteName of siteNames){
				let r = new RegExp(regStr.replace('{{host}}', siteName), 'gi');
				title = title.replace(r, '$1');
			}
		}

		return title;
	}

	export async function browserInfo(): Promise<browser_info>
	{
		try
		{
			let info = await browser.runtime.getBrowserInfo();
			let version = info.version.split('.')[0];
			return {name: 'firefox', version: Number(version)};
		}
		catch(e)
		{
			let userAgent = navigator.userAgent;
			let browserName: browser_name = 'unknown';

			if(userAgent.match(/firefox|fxios/i))
			{
				browserName = "firefox";
			}
			if(userAgent.match(/chrome|chromium|crios/i))
			{
				browserName = "chrome";
			}

			return {name: browserName, version: undefined};
		}
	}

	export function parseLink(e: HTMLAnchorElement | HTMLAreaElement): page_link
	{
		let isAnchor = (e instanceof HTMLAnchorElement);
		//@ts-ignore
		let desc = (isAnchor)? (e.title || e.textContent) : (e.alt || e.title);
		let href = e.href;
		return {href: href, text: desc};
	}

	export function getURLParam(url: string, param: string)
	{
		let u = new URL(url);
		return u.searchParams.get(param);
	}

	export function getFileType(filter: RequestFilter): filetype
	{
		if(filter.isImage()) return 'Image';
		if(filter.isText()) return 'Text';
		if(filter.isAudio()) return 'Audio';
		if(filter.isVideo()) return 'Video File';
		if(filter.isCompressed()) return 'Compressed Archive';
		if(filter.isBinary()) return 'Binary';
		if(filter.isDocument()) return 'Document';
		return 'Other';
	}

	export function gunzip(b64str: string): string
	{
		var startTime = performance.now();

		// Decode base64 (convert ascii to binary)
		var str = atob(b64str);

		// Convert binary string to character-number array
		var chars = [];
		for (var i = 0; i < str.length; ++i){
			chars.push(str.charCodeAt(i));
		}

		// Turn number array into byte-array
		var compBytes = new Uint8Array(chars);

		// Decompress the gzip data
		var decompBytes = fflate.gunzipSync(compBytes);

		// Convert gunzipped byteArray back to ascii string:
		var decompStr = new TextDecoder().decode(decompBytes);
		
		var endTime = performance.now();
		log.d(`gzip took ${endTime - startTime} milliseconds`);

		return decompStr;
	}

	export function splitGetLast(str: string, separator: string)
	{
		let parts = str.split(separator);
		return parts[parts.length - 1];
	}

}