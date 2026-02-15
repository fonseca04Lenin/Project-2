import logging

from flask import Blueprint, request, jsonify

from config import Config

logger = logging.getLogger(__name__)

youtube_bp = Blueprint('youtube', __name__, url_prefix='/api/youtube')


@youtube_bp.route('/search', methods=['GET'])
def youtube_search():
    """Search YouTube for videos about a person (CEO)"""
    import requests as http_requests

    query = request.args.get('q', '').strip()
    max_results = min(int(request.args.get('max_results', 5)), 10)

    if not query:
        return jsonify({'error': 'Query parameter "q" is required'}), 400

    youtube_api_key = Config.YOUTUBE_API_KEY

    if not youtube_api_key:
        search_url = f"https://www.youtube.com/results?search_query={query.replace(' ', '+')}"
        return jsonify({
            'videos': [],
            'search_url': search_url,
            'message': 'YouTube API key not configured. Use search_url to open YouTube search.'
        })

    try:
        youtube_url = 'https://www.googleapis.com/youtube/v3/search'
        params = {
            'part': 'snippet',
            'q': query,
            'type': 'video',
            'maxResults': max_results,
            'key': youtube_api_key,
            'order': 'relevance',
            'safeSearch': 'moderate'
        }

        response = http_requests.get(youtube_url, params=params, timeout=10)

        if response.status_code != 200:
            logger.error("YouTube API error: %s - %s", response.status_code, response.text)
            search_url = f"https://www.youtube.com/results?search_query={query.replace(' ', '+')}"
            return jsonify({
                'videos': [],
                'search_url': search_url,
                'message': 'YouTube API request failed. Use search_url to open YouTube search.'
            })

        data = response.json()
        videos = []

        for item in data.get('items', []):
            video_id = item.get('id', {}).get('videoId')
            snippet = item.get('snippet', {})

            if video_id:
                videos.append({
                    'id': video_id,
                    'title': snippet.get('title', ''),
                    'description': snippet.get('description', ''),
                    'thumbnail': snippet.get('thumbnails', {}).get('medium', {}).get('url',
                                 snippet.get('thumbnails', {}).get('default', {}).get('url', '')),
                    'channel': snippet.get('channelTitle', ''),
                    'published_at': snippet.get('publishedAt', ''),
                    'url': f'https://www.youtube.com/watch?v={video_id}'
                })

        search_url = f"https://www.youtube.com/results?search_query={query.replace(' ', '+')}"

        return jsonify({
            'videos': videos,
            'search_url': search_url,
            'query': query
        })

    except Exception as e:
        logger.error("YouTube search error: %s", e)
        search_url = f"https://www.youtube.com/results?search_query={query.replace(' ', '+')}"
        return jsonify({
            'videos': [],
            'search_url': search_url,
            'error': str(e)
        })
