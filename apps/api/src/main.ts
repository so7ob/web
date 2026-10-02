import 'reflect-metadata';
import { Controller, Get, Module, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import type { NestExpressApplication } from '@nestjs/platform-express';
import express, { type Request, type Response, type NextFunction } from 'express';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { database, assertSchema } from '@so7ob/server';
import type { PublicView } from '@so7ob/contracts';
import { PublicController } from './public.controller.js';
import { PublicService } from './public.service.js';
@Controller('api')
class HealthController {
  @Get(['health/ready', 'v1/health']) async ready() {
    const db = await database(); await assertSchema(db); await db.query('SELECT 1');
    return { ok: true, database: true };
  }
}
@Module({ controllers: [HealthController, PublicController], providers: [PublicService] })
class ApplicationModule {}
type Renderer = { render(url: string, data: PublicView): Promise<{ html: string; head: string; lang: string; dir: string }> };
async function main() {
  const db = await database(); await assertSchema(db);
  const app = await NestFactory.create<NestExpressApplication>(ApplicationModule, { cors: false });
  app.set('trust proxy', Number(process.env.TRUST_PROXY_HOPS ?? 0));
  app.enableCors({ origin: (process.env.WEB_ORIGIN ?? process.env.SITE_URL ?? 'http://127.0.0.1:3000').split(','), credentials: true, methods: ['GET','POST','PUT','PATCH','DELETE','OPTIONS'] });
  app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true }));
  app.enableShutdownHooks();
  const web = resolve('apps/web'); const production = process.env.NODE_ENV === 'production';
  const vite = production ? null : await (await import('vite')).createServer({ root: web, configFile: resolve(web, 'vite.config.ts'), server: { middlewareMode: true }, appType: 'custom' });
  if (vite) app.use(vite.middlewares);
  else app.use('/assets', express.static(resolve(web, 'dist/assets'), { immutable: true, maxAge: '1y', fallthrough: false }));
  app.use(express.static(resolve(web, production ? 'dist' : 'public'), { index: false, redirect: false }));
  app.use(async (req: Request, res: Response, next: NextFunction) => {
    if (req.path.startsWith('/api/') || !['GET','HEAD'].includes(req.method)) return next();
    try {
      if (req.path === '/') {
        const cookie = /(?:^|;\s*)so7ob-locale=(ar|en)(?:;|$)/.exec(req.headers.cookie ?? '');
        const locale = cookie?.[1] ?? ((req.headers['accept-language'] ?? '').split(',').some(t => t.trim().startsWith('en')) ? 'en' : 'ar');
        res.redirect(307, `/${locale}`); return;
      }
      if (req.path === '/robots.txt') { res.type('text/plain').send(`User-Agent: *\nAllow: /\nDisallow: /api/\n\nSitemap: ${process.env.SITE_URL}/sitemap.xml\n`); return; }
      if (req.path === '/sitemap.xml') {
        const pages: Array<{ slug: string; publishedAt: Date; isHome: boolean }> = await db.query('SELECT slug,publishedAt,isHome FROM Page WHERE status=? AND visibility=? ORDER BY `order`', ['published','public']);
        const origin = (process.env.SITE_URL ?? 'http://127.0.0.1:3000').replace(/\/+$/, '');
        const xml = (value: string) => value.replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('"','&quot;');
        const urls = pages.flatMap(p => ['ar','en'].map(locale => `<url><loc>${xml(`${origin}/${locale}${p.slug ? '/' + p.slug : ''}`)}</loc><lastmod>${(p.publishedAt ?? new Date()).toISOString()}</lastmod><changefreq>monthly</changefreq><priority>${p.isHome ? locale === 'ar' ? '1' : '0.9' : '0.7'}</priority>${['ar','en'].map(l => `<xhtml:link rel="alternate" hreflang="${l}" href="${xml(`${origin}/${l}${p.slug ? '/' + p.slug : ''}`)}"/>`).join('')}</url>`)).join('');
        res.type('application/xml').send(`<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">${urls}</urlset>`); return;
      }
      const data = await app.get(PublicService).view(req.originalUrl);
      if ('redirect' in data) { res.redirect(307, data.redirect); return; }
      const renderer: Renderer = vite ? await vite.ssrLoadModule('/src/entry-server.tsx') as Renderer : await import(pathToFileURL(resolve(web, 'dist/server/entry-server.js')).href);
      let template = await readFile(resolve(web, production ? 'dist/index.html' : 'index.html'), 'utf8');
      if (vite) template = await vite.transformIndexHtml(req.originalUrl, template);
      const rendered = await renderer.render(data.canonicalOrigin + req.originalUrl, data);
      const payload = JSON.stringify(data).replace(/[<>&\u2028\u2029]/g, char => `\\u${char.charCodeAt(0).toString(16).padStart(4,'0')}`);
      res.setHeader('Cache-Control', 'no-store');
      res.type('html').send(template.replace('__LANG__', rendered.lang).replace('__DIR__', rendered.dir).replace('<!--head-->', rendered.head).replace('<!--app-->', rendered.html).replace('<!--data-->', `<script>window.__SO7OB__=${payload}</script>`));
    } catch (error) {
      if (error && typeof error === 'object' && 'status' in error && error.status === 404) { res.status(404).type('html').send('<!doctype html><html lang="ar" dir="rtl"><title>404 — سُحُب</title><body><h1>الصفحة غير موجودة — Page not found</h1><a href="/ar">العربية</a> <a href="/en">English</a></body></html>'); return; }
      next(error);
    }
  });
  SwaggerModule.setup('api/docs', app, SwaggerModule.createDocument(app, new DocumentBuilder().setTitle('سُحُب — REST API').setVersion('1.0').addCookieAuth('so7ob.session').build()));
  await app.listen(Number(process.env.PORT ?? 3000), process.env.BIND_HOST ?? '127.0.0.1');
}
main().catch(error => { console.error(error instanceof Error ? error.message : 'Startup failed'); process.exitCode = 1; });
