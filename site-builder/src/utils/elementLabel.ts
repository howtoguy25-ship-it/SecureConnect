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
      return element.name || 'Product';
    case 'collection':
      return element.name || 'Collection';
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
    default:
      return 'square-outline';
  }
}
