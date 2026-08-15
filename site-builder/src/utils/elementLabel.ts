import { CanvasElement } from '@/types';

export function labelForElement(element: CanvasElement): string {
  switch (element.type) {
    case 'text':
      return element.text.trim() ? element.text.trim().slice(0, 24) : 'Text';
    case 'image':
      return 'Image';
    case 'shape':
      return 'Shape';
    case 'button':
      return element.label || 'Button';
    case 'icon':
      return 'Icon';
    case 'slideshow':
      return 'Slideshow';
    case 'video':
      return 'Video';
    case 'videoEmbed':
      return element.title || 'Video (YouTube)';
    case 'product':
      // ProductElement only stores a productId now (see the type's own comment) -- its real
      // name lives in the catalog and needs an async/live lookup, which this synchronous
      // labeler (used for plain text labels in the Layers panel etc.) can't do.
      return 'Product';
    case 'collection':
      return element.name || 'Collection';
    case 'game':
      return element.title || 'Game';
    case 'widget':
      return element.title || 'Widget';
    case 'customWidget':
      return element.title || 'Custom Feature';
    case 'section':
      return 'Section';
    default:
      return 'Element';
  }
}

export function iconForElement(element: CanvasElement): keyof typeof import('@expo/vector-icons').Ionicons.glyphMap {
  switch (element.type) {
    case 'text':
      return 'text-outline';
    case 'image':
      return 'image-outline';
    case 'shape':
      return 'shapes-outline';
    case 'button':
      return 'square-outline';
    case 'icon':
      return 'sparkles-outline';
    case 'slideshow':
      return 'images-outline';
    case 'video':
      return 'videocam-outline';
    case 'videoEmbed':
      return 'logo-youtube';
    case 'product':
      return 'pricetag-outline';
    case 'collection':
      return 'albums-outline';
    case 'game':
      return 'game-controller-outline';
    case 'widget':
      return 'time-outline';
    case 'customWidget':
      return 'sparkles-outline';
    case 'section':
      return 'copy-outline';
    default:
      return 'square-outline';
  }
}
