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
	 * @param data 
	 */
	export async function executeScript(tabId: number, data: object): Promise<any | undefined>
	{
		try
		{
			let res = await browser.tabs.executeScript(tabId, data);
			if(res.length === 0) return undefined;
			if(res.length === 1) return (res[0] != 'undefined')? res[0] : '';
			return res;
		}
		catch(e){
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

	export function notification(msg: string)
	{
		let options = {
			type: "basic", 
			title: "Grabby", 
			iconUrl: "icons/icon.svg",
			message: msg,
		};
		browser.notifications.create(options);
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

	export async function browserInfo(): Promise<{name: string, version: number}>
	{
		try
		{
			let info = await browser.runtime.getBrowserInfo();
			let version = info.version.split('.')[0];
			return {name: 'firefox', version: Number(version)};
		}
		catch(e)
		{
			return {name: 'not-firefox', version: -1};
		}
	}

}