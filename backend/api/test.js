export default function handler(request, response) {
    return response.status(200).json({
        message: "Vercel API routing works",
        method: request.method,
        url: request.url
    });
}