/**
 * webSearch.ts - Web Search Tool for LOKI
 * 
 * Provides internet search capabilities using DuckDuckGo.
 * Returns summarized results that the LLM can use for context.
 */

import * as https from 'https';
import * as http from 'http';

interface SearchResult {
    title: string;
    url: string;
    snippet: string;
}

interface WebSearchResponse {
    query: string;
    results: SearchResult[];
    summary: string;
}

/**
 * Performs a web search using DuckDuckGo's HTML interface
 * and extracts relevant results.
 */
export async function searchWeb(query: string, maxResults: number = 5): Promise<WebSearchResponse> {
    const encodedQuery = encodeURIComponent(query);

    // Use DuckDuckGo HTML (lite) version for simpler parsing
    const url = `https://html.duckduckgo.com/html/?q=${encodedQuery}`;

    try {
        const html = await fetchUrl(url);
        const results = parseSearchResults(html, maxResults);

        // Create a summary for the LLM
        const summary = results.length > 0
            ? `Found ${results.length} results for "${query}":\n${results.map((r, i) => `${i + 1}. ${r.title}\n   ${r.snippet}\n   URL: ${r.url}`).join('\n\n')}`
            : `No results found for "${query}"`;

        return {
            query,
            results,
            summary
        };
    } catch (error) {
        console.error('Web search failed:', error);
        return {
            query,
            results: [],
            summary: `Search failed: ${error instanceof Error ? error.message : 'Unknown error'}`
        };
    }
}

/**
 * Fetches content from a URL
 */
export async function fetchUrl(url: string): Promise<string> {
    return new Promise((resolve, reject) => {
        const protocol = url.startsWith('https') ? https : http;

        const options = {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                'Accept-Language': 'en-US,en;q=0.5'
            }
        };

        const req = protocol.get(url, options, (res) => {
            // Handle redirects
            if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
                fetchUrl(res.headers.location).then(resolve).catch(reject);
                return;
            }

            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => resolve(data));
        });

        req.on('error', reject);
        req.setTimeout(10000, () => {
            req.destroy();
            reject(new Error('Request timeout'));
        });
    });
}

/**
 * Parses DuckDuckGo HTML search results
 */
function parseSearchResults(html: string, maxResults: number): SearchResult[] {
    const results: SearchResult[] = [];

    // Pattern to match DuckDuckGo result blocks
    // DuckDuckGo HTML uses class="result" for each result
    const resultPattern = /<a class="result__a"[^>]*href="([^"]*)"[^>]*>([^<]*)<\/a>[\s\S]*?<a class="result__snippet"[^>]*>([^<]*(?:<[^>]*>[^<]*)*)<\/a>/gi;

    // Alternative simpler pattern
    const linkPattern = /<a[^>]*class="[^"]*result__a[^"]*"[^>]*href="([^"]*)"[^>]*>([^<]*)/gi;
    const snippetPattern = /<a[^>]*class="[^"]*result__snippet[^"]*"[^>]*>([^<]*)/gi;

    // Extract links
    const links: { url: string; title: string }[] = [];
    let linkMatch;
    while ((linkMatch = linkPattern.exec(html)) !== null && links.length < maxResults) {
        const url = decodeURIComponent(linkMatch[1].replace(/.*uddg=/, '').split('&')[0]);
        const title = decodeHtmlEntities(linkMatch[2]);
        if (url.startsWith('http') && title) {
            links.push({ url, title });
        }
    }

    // Extract snippets
    const snippets: string[] = [];
    let snippetMatch;
    while ((snippetMatch = snippetPattern.exec(html)) !== null && snippets.length < maxResults) {
        snippets.push(decodeHtmlEntities(snippetMatch[1]).replace(/<[^>]*>/g, '').trim());
    }

    // Combine
    for (let i = 0; i < Math.min(links.length, maxResults); i++) {
        results.push({
            title: links[i].title,
            url: links[i].url,
            snippet: snippets[i] || 'No description available'
        });
    }

    return results;
}

/**
 * Decodes HTML entities
 */
function decodeHtmlEntities(text: string): string {
    return text
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/&nbsp;/g, ' ')
        .trim();
}

/**
 * Fetches and extracts main content from a webpage
 * Useful for getting documentation, tutorials, etc.
 */
export async function fetchPageContent(url: string, maxLength: number = 5000): Promise<string> {
    try {
        const html = await fetchUrl(url);

        // Remove scripts, styles, and HTML tags
        let text = html
            .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
            .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
            .replace(/<nav[^>]*>[\s\S]*?<\/nav>/gi, '')
            .replace(/<header[^>]*>[\s\S]*?<\/header>/gi, '')
            .replace(/<footer[^>]*>[\s\S]*?<\/footer>/gi, '')
            .replace(/<[^>]+>/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();

        // Decode HTML entities
        text = decodeHtmlEntities(text);

        // Truncate to max length
        if (text.length > maxLength) {
            text = text.substring(0, maxLength) + '... [truncated]';
        }

        return text || 'Could not extract content from page';
    } catch (error) {
        return `Failed to fetch page: ${error instanceof Error ? error.message : 'Unknown error'}`;
    }
}

/**
 * Searches for design inspiration/examples
 * Adds relevant terms to the query for better results
 */
export async function searchDesignInspiration(topic: string): Promise<WebSearchResponse> {
    const designQuery = `${topic} modern design examples UI UX`;
    return searchWeb(designQuery, 5);
}

/**
 * Searches for code examples and documentation
 */
export async function searchCodeExamples(topic: string, language: string = ''): Promise<WebSearchResponse> {
    const codeQuery = `${topic} ${language} code example tutorial`;
    return searchWeb(codeQuery, 5);
}
