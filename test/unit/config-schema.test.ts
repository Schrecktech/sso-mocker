import { describe, it, expect } from 'vitest';
import {
  ServerSchema,
  StorageSchema,
  LoginSchema,
  ClientSchema,
  TeamSchema,
  RoleSchema,
  UserSchema,
  AdminSchema,
  AppConfigSchema,
} from '../../src/config/schema.js';

describe('config schemas', () => {
  describe('ServerSchema', () => {
    it('accepts valid server config', () => {
      const result = ServerSchema.parse({ port: 9090, issuer: 'http://localhost:9090' });
      expect(result.port).toBe(9090);
    });
    it('applies defaults', () => {
      const result = ServerSchema.parse({});
      expect(result.port).toBe(9090);
      expect(result.issuer).toBe('http://localhost:9090');
    });
    it('rejects invalid port', () => {
      expect(() => ServerSchema.parse({ port: -1 })).toThrow();
    });
  });
  describe('StorageSchema', () => {
    it('defaults to memory adapter', () => {
      const result = StorageSchema.parse({});
      expect(result.adapter).toBe('memory');
    });
    it('accepts redis with url', () => {
      const result = StorageSchema.parse({ adapter: 'redis', redis: { url: 'redis://localhost:6379' } });
      expect(result.adapter).toBe('redis');
    });
  });
  describe('LoginSchema', () => {
    it('defaults to form mode', () => {
      const result = LoginSchema.parse({});
      expect(result.mode).toBe('form');
    });
  });
  describe('ClientSchema', () => {
    it('accepts a public PKCE client', () => {
      const result = ClientSchema.parse({
        clientId: 'my-spa', clientSecret: null,
        redirectUris: ['http://localhost:3000/callback'],
        grantTypes: ['authorization_code'], scopes: [],
        tokenEndpointAuthMethod: 'none',
      });
      expect(result.clientId).toBe('my-spa');
    });
    it('accepts a confidential client', () => {
      const result = ClientSchema.parse({
        clientId: 'my-backend', clientSecret: 'secret',
        grantTypes: ['client_credentials'], scopes: ['read:users'],
        tokenEndpointAuthMethod: 'client_secret_basic',
      });
      expect(result.clientSecret).toBe('secret');
    });
  });
  describe('TeamSchema', () => {
    it('accepts valid team', () => {
      const result = TeamSchema.parse({ id: 'eng', name: 'Engineering', scopes: ['read:repos'] });
      expect(result.id).toBe('eng');
    });
  });
  describe('RoleSchema', () => {
    it('accepts wildcard scopes', () => {
      const result = RoleSchema.parse({ id: 'admin', name: 'Admin', scopes: ['*'] });
      expect(result.scopes).toEqual(['*']);
    });
  });
  describe('UserSchema', () => {
    it('accepts valid user', () => {
      const result = UserSchema.parse({ id: 'alice', email: 'alice@example.com', name: 'Alice', role: 'admin', teams: ['eng'] });
      expect(result.id).toBe('alice');
    });
  });
  describe('AdminSchema', () => {
    it('defaults to enabled with no apiKey', () => {
      const result = AdminSchema.parse({});
      expect(result.enabled).toBe(true);
      expect(result.apiKey).toBeNull();
    });
  });
  describe('AppConfigSchema', () => {
    it('accepts a minimal config', () => {
      const result = AppConfigSchema.parse({});
      expect(result.server.port).toBe(9090);
      expect(result.storage.adapter).toBe('memory');
      expect(result.clients).toEqual([]);
      expect(result.teams).toEqual([]);
      expect(result.roles).toEqual([]);
    });
  });
});
